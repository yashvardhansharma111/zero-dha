import { NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/auth";

const ALLOWED = ["signature", "bankProof", "document"] as const;
type DocType = (typeof ALLOWED)[number];

type StoredImage = {
  data?: unknown;
  contentType?: string;
};

function toBytes(input: unknown): Uint8Array | null {
  if (!input) return null;
  if (input instanceof Uint8Array) return new Uint8Array(input);
  if (typeof Buffer !== "undefined" && Buffer.isBuffer(input)) return new Uint8Array(input);
  if (typeof input === "object" && input !== null) {
    const obj = input as Record<string, unknown>;
    // Node.js Buffer JSON serialisation: { type: "Buffer", data: [...] }
    if (obj.type === "Buffer" && Array.isArray(obj.data)) {
      return Uint8Array.from(obj.data as number[]);
    }
    // BSON Binary — has a value() method returning the underlying Buffer
    if (typeof (obj as { value?: unknown }).value === "function") {
      try {
        const val = (obj as { value: () => unknown }).value();
        if (val instanceof Uint8Array) return new Uint8Array(val);
        if (typeof Buffer !== "undefined" && Buffer.isBuffer(val)) return new Uint8Array(val);
      } catch {
        // fall through
      }
    }
    // BSON Binary — has a .buffer property (Buffer / Uint8Array)
    const maybeBuffer = obj.buffer;
    if (maybeBuffer instanceof Uint8Array) return new Uint8Array(maybeBuffer);
    // MongoDB Extended JSON: { $binary: { base64: "...", subType: "00" } }
    const bin = (obj as { $binary?: unknown }).$binary;
    if (bin && typeof bin === "object") {
      const b = bin as Record<string, unknown>;
      if (typeof b.base64 === "string" && typeof Buffer !== "undefined") {
        return new Uint8Array(Buffer.from(b.base64, "base64"));
      }
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

    // Signature may be stored as an UploadThing URL rather than binary
    if (docType === "signature") {
      const sigUrl = (docs as Record<string, unknown> | undefined)?.signatureUploadThingUrl;
      if (typeof sigUrl === "string" && sigUrl.startsWith("https://")) {
        return NextResponse.redirect(sigUrl);
      }
    }

    const doc = docs?.[docType] as StoredImage | null | undefined;

    if (!doc?.data || !doc?.contentType) {
      return NextResponse.json({ message: "Document not found" }, { status: 404 });
    }

    const bytes = toBytes(doc.data);
    if (!bytes || bytes.byteLength === 0) {
      return NextResponse.json({ message: "Document invalid" }, { status: 500 });
    }

    return new NextResponse(Buffer.from(bytes), {
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
