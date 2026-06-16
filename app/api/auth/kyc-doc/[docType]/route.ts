import { NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/auth";

const ALLOWED = ["signature", "bankProof", "document"] as const;
type DocType = (typeof ALLOWED)[number];

type StoredImage = {
  data?: Buffer;
  contentType?: string;
};

function toBytes(input: unknown): Uint8Array | null {
  if (!input) return null;
  if (input instanceof Uint8Array) return new Uint8Array(input);
  if (typeof Buffer !== "undefined" && Buffer.isBuffer(input)) return new Uint8Array(input);
  if (typeof input === "object") {
    const obj = input as Record<string, unknown>;
    const asBufferShape = obj as { type?: unknown; data?: unknown };
    if (asBufferShape.type === "Buffer" && Array.isArray(asBufferShape.data)) {
      return Uint8Array.from(asBufferShape.data as number[]);
    }
    const asBinary = obj as { $binary?: unknown };
    if (asBinary.$binary && typeof asBinary.$binary === "object") {
      const b = asBinary.$binary as Record<string, unknown>;
      if (typeof b.base64 === "string" && typeof Buffer !== "undefined") {
        return new Uint8Array(Buffer.from(b.base64, "base64"));
      }
    }
    const maybeBuffer = obj.buffer;
    if (maybeBuffer instanceof Uint8Array) return new Uint8Array(maybeBuffer);
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

    const docs = (user as { documents?: Record<string, StoredImage | null> }).documents;
    const doc = docs?.[docType];

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
