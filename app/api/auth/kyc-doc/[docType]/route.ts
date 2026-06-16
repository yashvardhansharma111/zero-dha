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
    // BSON Binary: value() returns the correctly-sized buffer slice
    if (typeof (obj as { value?: unknown }).value === "function") {
      try {
        const v = (obj as { value: () => unknown }).value();
        if (Buffer.isBuffer(v)) return v;
        if (v instanceof Uint8Array) return Buffer.from(v);
      } catch { /* fall through */ }
    }
    // BSON Binary: .buffer property
    if (Buffer.isBuffer(obj.buffer)) return obj.buffer as Buffer;
    if (obj.buffer instanceof Uint8Array) return Buffer.from(obj.buffer as Uint8Array);
    // Node.js Buffer JSON: { type: "Buffer", data: [...] }
    if (obj.type === "Buffer" && Array.isArray(obj.data)) {
      return Buffer.from(obj.data as number[]);
    }
    // MongoDB Extended JSON: { $binary: { base64: "..." } }
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
  try {
    const { docType } = await params;
    if (!ALLOWED.includes(docType as DocType)) {
      return NextResponse.json({ message: "Invalid document type" }, { status: 400 });
    }

    const user = await getUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ message: "Not authenticated" }, { status: 401 });
    }

    const docs = (user as { documents?: Record<string, unknown> }).documents;

    // Signature may be stored as an UploadThing URL — proxy it so React Native Image doesn't need to follow redirects
    if (docType === "signature") {
      const sigUrl = (docs as Record<string, unknown> | undefined)?.signatureUploadThingUrl;
      if (typeof sigUrl === "string" && sigUrl.startsWith("https://")) {
        try {
          const upstream = await fetch(sigUrl);
          if (upstream.ok) {
            const buf = Buffer.from(await upstream.arrayBuffer());
            const ct = upstream.headers.get("content-type") || "image/jpeg";
            return new NextResponse(buf, {
              headers: { "Content-Type": ct, "Cache-Control": "no-store" },
            });
          }
        } catch {
          // fall through to binary check below
        }
      }
    }

    const doc = docs?.[docType] as { data?: unknown; contentType?: string } | null | undefined;

    if (!doc?.data || !doc?.contentType) {
      return NextResponse.json({ message: "Document not found" }, { status: 404 });
    }

    const bytes = toBuffer(doc.data);
    if (!bytes || bytes.byteLength === 0) {
      console.error("KYC doc: toBuffer returned empty for", docType);
      return NextResponse.json({ message: "Document invalid" }, { status: 500 });
    }

    return new NextResponse(bytes, {
      headers: {
        "Content-Type": doc.contentType,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("KYC doc error:", error);
    return NextResponse.json({ message: "Failed to load document" }, { status: 500 });
  }
}
