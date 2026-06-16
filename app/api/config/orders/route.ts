import { NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/auth";
import {
  getEffectiveOrdersConfigForUser,
  type OrderRowEffective,
} from "@/lib/effective-orders-config";

function computePnl(o: OrderRowEffective) {
      if (o.pnlManual && typeof o.pnl === "number" && Number.isFinite(o.pnl)) {
        return o.pnl;
      }

      const lots = Number(o.lots ?? o.qty ?? 0);
      const buy = Number(o.buyPrice ?? o.avgPrice ?? 0);
      const sell = Number(o.sellPrice ?? o.ltp ?? 0);

      if (o.side === "SELL") {
        return (buy - sell) * lots;
      }
      return (sell - buy) * lots;
}

export async function GET(request: Request) {
  try {
    const user = await getUserFromRequest(request);
    const userId = (user as { _id?: { toString(): string } } | null)?._id?.toString();

    const config = await getEffectiveOrdersConfigForUser(userId);

    const orders: OrderRowEffective[] = Array.isArray(config.orders)
      ? config.orders
      : [];

    const derivedSummary = {
      dayPnl: orders.reduce((a, o) => a + computePnl(o), 0),
      totalPnl: orders.reduce((a, o) => a + computePnl(o), 0),
    };

    return NextResponse.json({
      config: {
        ...config,
        summary: derivedSummary,
        segments: Array.isArray(config.segments) ? config.segments : [],
      },
    });
  } catch (error) {
    console.error("Config orders error:", error);
    return NextResponse.json(
      { message: "Failed to load orders" },
      { status: 500 },
    );
  }
}
