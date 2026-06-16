import { NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/auth";

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
    // Node.js Buffer JSON serialisation
    if (obj.type === "Buffer" && Array.isArray(obj.data)) {
      return Uint8Array.from(obj.data as number[]);
    }
    // BSON Binary value() method
    if (typeof (obj as { value?: unknown }).value === "function") {
      try {
        const val = (obj as { value: () => unknown }).value();
        if (val instanceof Uint8Array) return new Uint8Array(val);
        if (typeof Buffer !== "undefined" && Buffer.isBuffer(val)) return new Uint8Array(val);
      } catch {
        // fall through
      }
    }
    // BSON Binary .buffer property
    const maybeBuffer = obj.buffer;
    if (maybeBuffer instanceof Uint8Array) return new Uint8Array(maybeBuffer);
    // MongoDB Extended JSON
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

export async function GET(request: Request) {
  try {
    const user = await getUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ message: "Not authenticated" }, { status: 401 });
    }

    const photo = (user as { documents?: { photo?: StoredImage } }).documents?.photo;
    if (!photo?.data || !photo.contentType) {
      return NextResponse.json({ message: "Profile photo not found" }, { status: 404 });
    }

    const bytes = toBytes(photo.data);
    if (!bytes || bytes.byteLength === 0) {
      return NextResponse.json({ message: "Profile photo invalid" }, { status: 500 });
    }

    return new NextResponse(Buffer.from(bytes), {
      headers: {
        "Content-Type": photo.contentType,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("Auth photo error:", error);
    return NextResponse.json({ message: "Failed to load profile photo" }, { status: 500 });
  }
}
