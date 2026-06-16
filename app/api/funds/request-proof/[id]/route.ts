import { NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/auth";
import { getDb } from "@/lib/mongodb";
import { ObjectId } from "mongodb";

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
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await getUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ message: "Not authenticated" }, { status: 401 });
    }

    const { id } = await params;
    if (!ObjectId.isValid(id)) {
      return NextResponse.json({ message: "Invalid request ID" }, { status: 400 });
    }

    const db = await getDb();
    const doc = await db.collection("fund_requests").findOne<{
      proof?: StoredImage;
      userId?: ObjectId;
    }>({
      _id: new ObjectId(id),
      userId: (user as { _id: ObjectId })._id,
    });

    if (!doc?.proof?.data || !doc?.proof?.contentType) {
      return NextResponse.json({ message: "Proof not found" }, { status: 404 });
    }

    const bytes = toBytes(doc.proof.data);
    if (!bytes || bytes.byteLength === 0) {
      return NextResponse.json({ message: "Proof image invalid" }, { status: 500 });
    }

    return new NextResponse(Buffer.from(bytes), {
      headers: {
        "Content-Type": doc.proof.contentType,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("Fund request proof error:", error);
    return NextResponse.json({ message: "Failed to load proof" }, { status: 500 });
  }
}
