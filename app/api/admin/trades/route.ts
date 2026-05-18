import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { placeOrder } from "@/lib/trades";
import { getDb } from "@/lib/mongodb";

async function requireAdmin() {
  const cookieStore = await cookies();
  const adminCookie = cookieStore.get("ajx_admin");
  return !!adminCookie && adminCookie.value === "ok";
}

/** GET /api/admin/trades?userId=xxx  — list real trades for a user */
export async function GET(request: Request) {
  try {
    const ok = await requireAdmin();
    if (!ok) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId");
    const limit = Math.min(Number(searchParams.get("limit") || "50"), 200);

    if (!userId || !ObjectId.isValid(userId)) {
      return NextResponse.json({ trades: [] });
    }

    const db = await getDb();
    const trades = await db
      .collection("trades")
      .find({ userId: new ObjectId(userId) })
      .sort({ createdAt: -1 })
      .limit(limit)
      .toArray();

    return NextResponse.json({
      trades: trades.map((t) => ({ ...t, _id: t._id!.toString() })),
    });
  } catch (error: any) {
    console.error("[admin/trades GET]", error);
    return NextResponse.json(
      { message: error?.message || "Failed to fetch trades" },
      { status: 500 },
    );
  }
}

/** POST /api/admin/trades  — place a real trade on behalf of a user */
export async function POST(request: Request) {
  try {
    const ok = await requireAdmin();
    if (!ok) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

    const body = await request.json();
    const { userId, symbol, exchange, side, qty, productType, optionType, strikePrice, expiry, orderType, limitPrice } =
      body;

    if (!userId || !symbol || !exchange || !side || !qty) {
      return NextResponse.json(
        { message: "userId, symbol, exchange, side, qty are required" },
        { status: 400 },
      );
    }

    if (!ObjectId.isValid(userId)) {
      return NextResponse.json(
        { message: `Invalid userId: "${userId}" is not a valid MongoDB ObjectId` },
        { status: 400 },
      );
    }

    console.log(`[admin/trades] Placing ${side} ${qty}×${exchange}:${symbol} for user ${userId}`);

    const resolvedOrderType: "MARKET" | "LIMIT" =
      orderType === "LIMIT" ? "LIMIT" : "MARKET";

    const result = await placeOrder({
      userId,
      symbol,
      exchange,
      side,
      qty: Number(qty),
      orderType: resolvedOrderType,
      limitPrice: resolvedOrderType === "LIMIT" && limitPrice ? Number(limitPrice) : undefined,
      productType: productType || "CNC",
      optionType: optionType || undefined,
      strikePrice: strikePrice ? Number(strikePrice) : undefined,
      expiry: expiry || undefined,
    });

    return NextResponse.json({
      message: `${side} order placed for ${symbol}`,
      trade: result.trade,
      newBalance: result.newBalance,
    });
  } catch (error: any) {
    console.error("[admin/trades POST]", error?.message, error);
    const isUserError =
      error?.message?.includes("Insufficient") ||
      error?.message?.includes("not found") ||
      error?.message?.includes("Cannot resolve token");
    return NextResponse.json(
      { message: error?.message || "Trade failed" },
      { status: isUserError ? 400 : 500 },
    );
  }
}
