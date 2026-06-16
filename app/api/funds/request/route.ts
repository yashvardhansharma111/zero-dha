import { NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/auth";
import { getDb } from "@/lib/mongodb";
import { ObjectId } from "mongodb";

export async function GET(request: Request) {
  try {
    const user = await getUserFromRequest(request);
    if (!user) {
      return NextResponse.json(
        { message: "Not authenticated" },
        { status: 401 },
      );
    }

    const db = await getDb();
    const funds = db.collection("fund_requests");

    const requests = await funds
      .find({ userId: new ObjectId((user as { _id: ObjectId })._id) })
      .sort({ createdAt: -1 })
      .limit(25)
      .toArray();

    return NextResponse.json({
      requests: requests.map((item) => ({
        _id: item._id,
        type: item.type || "add",
        amount: item.amount,
        method: item.method || "upi",
        reference: item.reference || "",
        note: item.note || "",
        status: item.status || "pending",
        createdAt: item.createdAt,
        processedAt: item.processedAt || null,
        hasProof: Boolean(item.proof?.data),
      })),
    });
  } catch (error) {
    console.error("Fund request list error:", error);
    return NextResponse.json(
      { message: "Failed to load fund requests" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const user = await getUserFromRequest(request);
    if (!user) {
      return NextResponse.json(
        { message: "Not authenticated" },
        { status: 401 },
      );
    }

    const contentType = request.headers.get("content-type") || "";
    let amount: number;
    let method: string;
    let reference: string;
    let note: string;
    let type: string;
    let proofDoc: { data: Buffer; contentType: string } | null = null;

    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      amount = Number(formData.get("amount") || 0);
      method = String(formData.get("method") || "upi");
      reference = String(formData.get("reference") || "");
      note = String(formData.get("note") || "");
      type = String(formData.get("type") || "add");

      const proofFile = formData.get("proof");
      if (proofFile instanceof File && proofFile.size > 0) {
        const buf = await proofFile.arrayBuffer();
        proofDoc = {
          data: Buffer.from(buf),
          contentType: proofFile.type || "image/jpeg",
        };
      }
    } else {
      const body = await request.json();
      amount = Number(body?.amount || 0);
      method = String(body?.method || "upi");
      reference = String(body?.reference || "");
      note = String(body?.note || "");
      type = String(body?.type || "add");
    }

    const numericAmount = amount;
    if (!numericAmount || numericAmount <= 0) {
      return NextResponse.json(
        { message: "Valid amount is required" },
        { status: 400 },
      );
    }

    const db = await getDb();
    const funds = db.collection("fund_requests");
    const users = db.collection("users");
    const requestType = type === "withdraw" ? "withdraw" : "add";

    if (requestType === "withdraw") {
      const currentUser = await users.findOne<{ tradingBalance?: number }>({
        _id: new ObjectId((user as { _id: ObjectId })._id),
      });
      const currentBalance = Number(currentUser?.tradingBalance ?? 0);
      if (numericAmount > currentBalance) {
        return NextResponse.json(
          { message: "Withdrawal amount cannot exceed current trading balance" },
          { status: 400 },
        );
      }
    }

    const insertDoc: Record<string, unknown> = {
      userId: new ObjectId((user as { _id: ObjectId })._id),
      type: requestType,
      amount: numericAmount,
      method: method || "upi",
      reference: reference || "",
      note: note || "",
      status: "pending",
      createdAt: new Date(),
    };

    if (proofDoc) {
      insertDoc.proof = proofDoc;
    }

    await funds.insertOne(insertDoc);

    return NextResponse.json({
      message:
        requestType === "withdraw"
          ? "Withdraw request submitted. Admin will verify and process your withdrawal."
          : "Fund request submitted. Admin will verify payment and update your balance.",
    });
  } catch (error) {
    console.error("Fund request error:", error);
    return NextResponse.json(
      { message: "Failed to submit fund request" },
      { status: 500 },
    );
  }
}
