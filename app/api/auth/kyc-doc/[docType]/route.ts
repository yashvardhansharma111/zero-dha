import { NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/auth";

const ALLOWED = ["signature", "bankProof", "document"] as const;
type DocType = (typeof ALLOWED)[number];

function toBuffer(input: unknown): Buffer | null {
  if (!input) return null;
  if (Buffer.isBuffer(input)) return input;
  if (input instanceof Uint8Array) return Buffer.from(input);
  if (typeof input === "object" && input !== null) {
    const obj = input as Record<string, unknown>;
    if (typeof (obj as { value?: unknown }).value === "function") {
      try {
        const v = (obj as { value: () => unknown }).value();
        if (Buffer.isBuffer(v)) return v;
        if (v instanceof Uint8Array) return Buffer.from(v);
      } catch { /* fall through */ }
    }
    if (Buffer.isBuffer(obj.buffer)) return obj.buffer as Buffer;
    if (obj.buffer instanceof Uint8Array) return Buffer.from(obj.buffer as Uint8Array);
    if (obj.type === "Buffer" && Array.isArray(obj.data)) {
      return Buffer.from(obj.data as number[]);
    }
    const bin = (obj as { $binary?: unknown }).$binary;
    if (bin && typeof bin === "object") {
      const b = bin as Record<string, unknown>;
      if (typeof b.base64 === "string") return Buffer.from(b.base64, "base64");
    }
  }
  return null;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ docType: string }> },
) {
  const tag = "[kyc-doc]";
  try {
    const { docType } = await params;
    console.log(tag, "docType:", docType);

    if (!ALLOWED.includes(docType as DocType)) {
      console.log(tag, "invalid docType");
      return NextResponse.json({ message: "Invalid document type" }, { status: 400 });
    }

    const user = await getUserFromRequest(request);
    if (!user) {
      console.log(tag, "no user — auth header:", request.headers.get("authorization")?.slice(0, 20));
      return NextResponse.json({ message: "Not authenticated" }, { status: 401 });
    }
    console.log(tag, "user id:", (user as { _id: unknown })._id);

    const docs = (user as { documents?: Record<string, unknown> }).documents;
    console.log(tag, "documents keys:", docs ? Object.keys(docs) : "no documents field");

    // Signature may be stored as an UploadThing URL
    if (docType === "signature") {
      const sigUrl = (docs as Record<string, unknown> | undefined)?.signatureUploadThingUrl;
      console.log(tag, "signatureUploadThingUrl:", sigUrl);
      if (typeof sigUrl === "string" && sigUrl.startsWith("https://")) {
        try {
          console.log(tag, "fetching UploadThing URL...");
          const upstream = await fetch(sigUrl);
          console.log(tag, "upstream status:", upstream.status, "content-type:", upstream.headers.get("content-type"));
          if (upstream.ok) {
            const buf = Buffer.from(await upstream.arrayBuffer());
            const ct = upstream.headers.get("content-type") || "image/jpeg";
            console.log(tag, "proxying UploadThing image, bytes:", buf.byteLength);
            return new NextResponse(buf, {
              headers: { "Content-Type": ct, "Cache-Control": "no-store" },
            });
          }
        } catch (e) {
          console.error(tag, "UploadThing fetch failed:", e);
        }
      }
    }

    const doc = docs?.[docType] as { data?: unknown; contentType?: string } | null | undefined;
    console.log(tag, docType, "doc present:", !!doc, "has data:", !!(doc as { data?: unknown })?.data, "contentType:", (doc as { contentType?: string })?.contentType);

    if (doc?.data) {
      const d = doc.data;
      console.log(tag, "data typeof:", typeof d, "constructor:", (d as object)?.constructor?.name,
        "isBuffer:", Buffer.isBuffer(d), "isUint8Array:", d instanceof Uint8Array,
        "keys:", typeof d === "object" && d !== null ? Object.keys(d as object).slice(0, 8) : "n/a");
    }

    if (!doc?.data || !doc?.contentType) {
      console.log(tag, "returning 404 — doc or data missing");
      return NextResponse.json({ message: "Document not found" }, { status: 404 });
    }

    const bytes = toBuffer(doc.data);
    console.log(tag, "toBuffer result:", bytes ? `${bytes.byteLength} bytes` : "null");

    if (!bytes || bytes.byteLength === 0) {
      return NextResponse.json({ message: "Document invalid" }, { status: 500 });
    }

    return new NextResponse(bytes, {
      headers: { "Content-Type": doc.contentType, "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error(tag, "unhandled error:", error);
    return NextResponse.json({ message: "Failed to load document" }, { status: 500 });
  }
}
