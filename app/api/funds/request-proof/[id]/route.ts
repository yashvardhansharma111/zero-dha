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
  { params }: { params: Promise<{ id: string }> },
) {
  const tag = "[proof]";
  try {
    const user = await getUserFromRequest(request);
    if (!user) {
      console.log(tag, "not authenticated — auth header:", request.headers.get("authorization")?.slice(0, 20));
      return NextResponse.json({ message: "Not authenticated" }, { status: 401 });
    }
    const userId = (user as { _id: ObjectId })._id;
    console.log(tag, "user id:", userId);

    const { id } = await params;
    console.log(tag, "request id param:", id);

    if (!ObjectId.isValid(id)) {
      console.log(tag, "invalid ObjectId");
      return NextResponse.json({ message: "Invalid request ID" }, { status: 400 });
    }

    const db = await getDb();

    // First check if the document exists at all (without userId filter)
    const docAny = await db.collection("fund_requests").findOne({ _id: new ObjectId(id) });
    console.log(tag, "doc exists (no userId filter):", !!docAny,
      "stored userId:", docAny ? String((docAny as { userId?: unknown }).userId) : "n/a",
      "querying with userId:", String(userId));

    const doc = await db.collection("fund_requests").findOne({
      _id: new ObjectId(id),
      userId,
    });
    console.log(tag, "doc found (with userId filter):", !!doc);

    const proofData = (doc as { proof?: { data?: unknown; contentType?: string } } | null)?.proof;
    console.log(tag, "proof present:", !!proofData, "has data:", !!proofData?.data, "contentType:", proofData?.contentType);

    if (proofData?.data) {
      const d = proofData.data;
      console.log(tag, "proof.data typeof:", typeof d, "constructor:", (d as object)?.constructor?.name,
        "isBuffer:", Buffer.isBuffer(d), "isUint8Array:", d instanceof Uint8Array,
        "keys:", typeof d === "object" && d !== null ? Object.keys(d as object).slice(0, 8) : "n/a");
    }

    if (!proofData?.data || !proofData?.contentType) {
      console.log(tag, "returning 404");
      return NextResponse.json({ message: "Proof not found" }, { status: 404 });
    }

    const bytes = toBuffer(proofData.data);
    console.log(tag, "toBuffer result:", bytes ? `${bytes.byteLength} bytes` : "null");

    if (!bytes || bytes.byteLength === 0) {
      return NextResponse.json({ message: "Proof image invalid" }, { status: 500 });
    }

    return new NextResponse(bytes, {
      headers: { "Content-Type": proofData.contentType, "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error(tag, "unhandled error:", error);
    return NextResponse.json({ message: "Failed to load proof" }, { status: 500 });
  }
}
