import { apiErrorResponse } from "@/lib/api-error";
import { getDb } from "@/lib/mongodb";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { ObjectId } from "mongodb";

function bufferToBase64DataUri(
  data: unknown,
  contentType: string,
): string | null {
  let bytes: Buffer | null = null;

  if (Buffer.isBuffer(data)) {
    bytes = data;
  } else if (data instanceof Uint8Array) {
    bytes = Buffer.from(data);
  } else if (
    typeof data === "object" &&
    data !== null &&
    (data as { type?: unknown }).type === "Buffer" &&
    Array.isArray((data as { data?: unknown }).data)
  ) {
    bytes = Buffer.from((data as { data: number[] }).data);
  } else if (
    typeof data === "object" &&
    data !== null &&
    typeof (data as { $binary?: { base64?: string } }).$binary?.base64 === "string"
  ) {
    bytes = Buffer.from(
      (data as { $binary: { base64: string } }).$binary.base64,
      "base64",
    );
  }

  if (!bytes || bytes.length === 0) return null;
  return `data:${contentType};base64,${bytes.toString("base64")}`;
}

export async function GET(request: Request) {
  try {
    const cookieStore = await cookies();
    const adminCookie = cookieStore.get("ajx_admin");
    if (!adminCookie || adminCookie.value !== "ok") {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId");
    if (!userId) {
      return NextResponse.json(
        { message: "userId query param is required" },
        { status: 400 },
      );
    }

    const db = await getDb();
    const user = await db.collection("users").findOne({
      _id: new ObjectId(userId),
    });

    if (!user) {
      return NextResponse.json({ message: "User not found" }, { status: 404 });
    }

    const docs = user.documents as
      | Record<string, { data?: unknown; contentType?: string } | null>
      | undefined;

    const documentPreviews: Record<string, string | null> = {};
    if (docs) {
      for (const key of ["photo", "signature", "bankProof", "document"]) {
        const entry = docs[key];
        if (entry?.data && entry.contentType) {
          documentPreviews[key] = bufferToBase64DataUri(
            entry.data,
            entry.contentType,
          );
        } else {
          documentPreviews[key] = null;
        }
      }
    }

    const signatureUploadThingUrl =
      (docs as { signatureUploadThingUrl?: string } | undefined)
        ?.signatureUploadThingUrl || null;

    const fundRequests = await db
      .collection("fund_requests")
      .find({ userId: new ObjectId(userId) })
      .sort({ createdAt: -1 })
      .limit(30)
      .toArray();

    return NextResponse.json({
      user: {
        _id: user._id.toString(),
        fullName: user.fullName ?? null,
        email: user.email ?? null,
        phone: user.phone ?? null,
        clientId: user.clientId ?? null,
        status: user.status ?? null,
        panNumber: user.panNumber ?? null,
        aadhaarNumber: user.aadhaarNumber ?? null,
        bankDetails: user.bankDetails ?? null,
        tradingBalance: user.tradingBalance ?? 0,
        margin: user.margin ?? 0,
        createdAt: user.createdAt ?? null,
        activatedAt: user.activatedAt ?? null,
        documentPreviews,
        signatureUploadThingUrl,
      },
      fundRequests: fundRequests.map((r) => ({
        _id: r._id.toString(),
        type: r.type || "add",
        amount: r.amount,
        method: r.method || "upi",
        reference: r.reference || "",
        note: r.note || "",
        status: r.status || "pending",
        createdAt: r.createdAt,
        hasProof: Boolean(r.proof?.data),
      })),
    });
  } catch (error) {
    return apiErrorResponse(
      error,
      "Admin user-details error:",
      "Failed to fetch user details",
    );
  }
}
