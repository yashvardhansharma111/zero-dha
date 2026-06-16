import { NextRequest, NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/auth";
import { placeOrder } from "@/lib/trades";
import { getEffectiveOrdersConfigForUser } from "@/lib/effective-orders-config";
import { upsertScopedConfig } from "@/lib/scoped-config";

function isIndianMarketOpen(): { open: boolean; message?: string } {
  const now = new Date();
  // IST = UTC+5:30
  const utcMs = now.getTime() + now.getTimezoneOffset() * 60000;
  const ist = new Date(utcMs + 5.5 * 3600 * 1000);
  const day = ist.getDay(); // 0=Sun, 6=Sat
  if (day === 0 || day === 6) {
    return { open: false, message: "Market is closed on weekends. Trading hours: Mon–Fri 9:15 AM – 3:30 PM IST" };
  }
  const totalMins = ist.getHours() * 60 + ist.getMinutes();
  if (totalMins < 555 || totalMins > 930) { // 9:15=555, 15:30=930
    return { open: false, message: "Market is closed. Trading hours: Mon–Fri 9:15 AM – 3:30 PM IST" };
  }
  return { open: true };
}

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

    const marketStatus = isIndianMarketOpen();
    if (!marketStatus.open) {
      return NextResponse.json({ message: marketStatus.message }, { status: 403 });
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
