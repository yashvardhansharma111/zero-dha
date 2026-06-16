import { apiErrorResponse } from "@/lib/api-error";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";
import { ObjectId } from "mongodb";

export async function GET() {
  try {
    const cookieStore = await cookies();
    const adminCookie = cookieStore.get("ajx_admin");
    if (!adminCookie || adminCookie.value !== "ok") {
      return NextResponse.json(
        { message: "Unauthorized" },
        { status: 401 },
      );
    }

    const db = await getDb();
    const funds = db.collection("fund_requests");
    const users = db.collection("users");

    const requests = await funds
      .find({})
      .sort({ createdAt: -1 })
      .limit(50)
      .toArray();

    const userIds = Array.from(
      new Set(
        requests.map((r) => (r.userId as ObjectId).toString()),
      ),
    ).map((id) => new ObjectId(id));

    const userDocs = await users
      .find(
        { _id: { $in: userIds } },
        { projection: { fullName: 1, email: 1 } },
      )
      .toArray();

    const userMap = new Map(
      userDocs.map((u) => [u._id.toString(), u]),
    );

    const result = requests.map((r) => {
      const u = userMap.get((r.userId as ObjectId).toString());
      return {
        _id: r._id.toString(),
        userId: (r.userId as ObjectId).toString(),
        type: r.type || "add",
        amount: r.amount,
        method: r.method,
        reference: r.reference,
        note: r.note,
        status: r.status,
        createdAt: r.createdAt,
        userName: u?.fullName || "Unknown",
        userEmail: u?.email || "",
        hasProof: Boolean(r.proof?.data),
      };
    });

    return NextResponse.json({ requests: result });
  } catch (error) {
    return apiErrorResponse(
      error,
      "Admin funds list error:",
      "Failed to fetch fund requests",
    );
  }
}
