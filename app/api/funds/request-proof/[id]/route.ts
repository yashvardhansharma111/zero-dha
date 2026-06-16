import { NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/auth";
import { getDb } from "@/lib/mongodb";
import { ObjectId } from "mongodb";

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
    const doc = await db.collection("fund_requests").findOne({
      _id: new ObjectId(id),
      userId: (user as { _id: ObjectId })._id,
    });

    const proofData = (doc as { proof?: { data?: unknown; contentType?: string } } | null)?.proof;

    if (!proofData?.data || !proofData?.contentType) {
      return NextResponse.json({ message: "Proof not found" }, { status: 404 });
    }

    const bytes = toBuffer(proofData.data);
    if (!bytes || bytes.byteLength === 0) {
      console.error("Fund proof: toBuffer returned empty for id", id);
      return NextResponse.json({ message: "Proof image invalid" }, { status: 500 });
    }

    return new NextResponse(bytes, {
      headers: {
        "Content-Type": proofData.contentType,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("Fund request proof error:", error);
    return NextResponse.json({ message: "Failed to load proof" }, { status: 500 });
  }
}
