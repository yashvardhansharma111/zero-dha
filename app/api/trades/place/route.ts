import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { getUserFromRequest } from "@/lib/auth";
import { placeOrder } from "@/lib/trades";
import { getEffectiveOrdersConfigForUser } from "@/lib/effective-orders-config";
import { upsertScopedConfig } from "@/lib/scoped-config";
import { getDb } from "@/lib/mongodb";


/**
 * POST /api/trades/place
 * Body: { symbol, exchange, side, qty, orderType, limitPrice?, productType?, optionType?, strikePrice?, expiry? }
 */
export async function POST(request: NextRequest) {
  try {
    const user = await getUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const {
      symbol,
      exchange = "NSE",
      side,
      qty,
      orderType = "MARKET",
      limitPrice,
      productType = "CNC",
      optionType,
      strikePrice,
      expiry,
    } = body;

    if (!symbol || !side || !qty) {
      return NextResponse.json(
        { message: "symbol, side, and qty are required" },
        { status: 400 },
      );
    }

    if (!["BUY", "SELL"].includes(side)) {
      return NextResponse.json(
        { message: "side must be BUY or SELL" },
        { status: 400 },
      );
    }

    const userId = user._id.toString();

    // For SELL: if no real DB position exists but an admin-configured position does,
    // mark it as CLOSED so it disappears from the user's view (no real trade placed).
    if (side === "SELL") {
      const effectiveConfig = await getEffectiveOrdersConfigForUser(userId);
      const symUp = symbol?.toUpperCase().trim();
      const adminPos = (effectiveConfig.orders ?? []).find(
        (r) =>
          r.segmentKey === "positions" &&
          r.status !== "CLOSED" &&
          r.side?.toUpperCase() === "BUY" &&
          (
            r.symbol?.toUpperCase().trim() === symUp ||
            r.symbol?.toUpperCase().trim().startsWith(symUp)
          ),
      );

      if (adminPos) {
        const updatedOrders = effectiveConfig.orders.map((r) =>
          r.id === adminPos.id ? { ...r, status: "CLOSED" as const } : r,
        );
        await upsertScopedConfig({
          key: "dashboard_orders",
          userId,
          config: { ...effectiveConfig, orders: updatedOrders },
        });

        const exitPrice = Number(adminPos.ltp || adminPos.avgPrice || 0);
        const avgPrice = Number(adminPos.avgPrice || 0);
        const exitQty = Number(qty);
        const pnl = (exitPrice - avgPrice) * exitQty;

        // Save to trades collection so it appears in History tab
        const db = await getDb();
        await db.collection("trades").insertOne({
          userId: new ObjectId(userId),
          symbol,
          exchange,
          side: "SELL",
          orderType: "MARKET",
          qty: exitQty,
          price: exitPrice,
          status: "EXECUTED",
          productType: adminPos.productType || "CNC",
          lotSize: 1,
          totalValue: exitPrice * exitQty,
          segmentKey: "history",
          optionType: adminPos.optionType,
          strikePrice: adminPos.strikePrice ? Number(adminPos.strikePrice) : undefined,
          expiry: adminPos.expiryDate || undefined,
          pnl,
          createdAt: new Date(),
          executedAt: new Date(),
        });

        return NextResponse.json({
          message: `SELL ${qty} ${symbol} @ ₹${exitPrice.toFixed(2)}`,
          trade: {
            id: adminPos.id,
            symbol,
            exchange,
            side: "SELL",
            qty: Number(qty),
            price: exitPrice,
            totalValue: exitPrice * Number(qty),
            status: "EXECUTED",
            executedAt: new Date(),
          },
          newBalance: Number(user.tradingBalance ?? 0),
        });
      }
    }

    const { trade, newBalance } = await placeOrder({
      userId,
      symbol,
      exchange,
      side,
      qty: Number(qty),
      orderType,
      limitPrice: limitPrice ? Number(limitPrice) : undefined,
      productType,
      optionType,
      strikePrice: strikePrice ? Number(strikePrice) : undefined,
      expiry,
    });

    return NextResponse.json({
      message: `${side} ${qty} ${symbol} @ ₹${trade.price.toFixed(2)}`,
      trade: {
        id: trade._id?.toString(),
        symbol: trade.symbol,
        exchange: trade.exchange,
        side: trade.side,
        qty: trade.qty,
        price: trade.price,
        totalValue: trade.totalValue,
        status: trade.status,
        executedAt: trade.executedAt,
      },
      newBalance,
    });
  } catch (err: any) {
    console.error("[trades/place]", err);
    const status = err.message?.includes("Insufficient") ? 400 : 500;
    return NextResponse.json(
      { message: err.message || "Order failed" },
      { status },
    );
  }
}
