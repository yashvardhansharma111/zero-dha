import { NextRequest, NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/auth";
import { getPositions } from "@/lib/trades";
import { getEffectiveOrdersConfigForUser } from "@/lib/effective-orders-config";
import { computeOrderPnl } from "@/lib/admin-orders-pnl";

/**
 * GET /api/trades/positions
 * Returns admin-configured position rows for this user when they exist,
 * otherwise falls back to real DB positions with live LTP.
 * Uses the same effective config as /api/config/orders so the summary
 * always matches what the app's position list shows.
 */
export async function GET(request: NextRequest) {
  try {
    const user = await getUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const userId = user._id.toString();

    // Use the same effective config (global + user merge) that drives configRows in the app
    const effectiveConfig = await getEffectiveOrdersConfigForUser(userId);
    const allAdminPositions = (effectiveConfig.orders ?? []).filter(
      (r) => r.segmentKey === "positions",
    );

    if (allAdminPositions.length > 0) {
      function mapPosition(r: typeof allAdminPositions[number]) {
        const pnl = computeOrderPnl(r);
        const qty = Number(r.qty || 0);
        const avgPrice = Number(r.avgPrice || 0);
        const ltp = Number(r.ltp || r.sellPrice || r.buyPrice || avgPrice || 0);
        const investedValue = avgPrice * qty;
        const currentValue = ltp * qty;
        const pnlPct =
          r.pnlPct != null
            ? Number(r.pnlPct)
            : investedValue > 0
            ? (pnl / investedValue) * 100
            : 0;
        return {
          id: r.id,
          symbol: r.symbol,
          exchange: r.exchange || r.market || "NSE",
          side: r.side,
          qty,
          avgPrice,
          ltp,
          pnl,
          pnlPct,
          currentValue,
          investedValue,
          productType: r.productType,
          optionType: r.optionType,
          strikePrice: r.strikePrice,
          expiry: r.expiryDate || undefined,
        };
      }

      // Only show OPEN positions in the list
      const openPositions = allAdminPositions
        .filter((r) => r.status !== "CLOSED")
        .map(mapPosition);

      // But sum P&L across ALL (open + closed) so realized P&L persists after exit
      const allMapped = allAdminPositions.map(mapPosition);
      const totalInvested = openPositions.reduce((s, p) => s + p.investedValue, 0);
      const totalCurrent = openPositions.reduce((s, p) => s + p.currentValue, 0);
      const totalPnl = allMapped.reduce((s, p) => s + p.pnl, 0);
      const totalPnlPct = totalInvested > 0 ? (totalPnl / totalInvested) * 100 : 0;

      return NextResponse.json({
        positions: openPositions,
        summary: {
          totalInvested,
          totalCurrent,
          totalPnl,
          totalPnlPct,
          count: openPositions.length,
        },
      });
    }

    // Fall back to real DB positions with live LTP
    const positions = await getPositions(userId);
    const totalInvested = positions.reduce((s, p) => s + p.investedValue, 0);
    const totalCurrent = positions.reduce((s, p) => s + p.currentValue, 0);
    const totalPnl = totalCurrent - totalInvested;
    const totalPnlPct = totalInvested > 0 ? (totalPnl / totalInvested) * 100 : 0;

    return NextResponse.json({
      positions: positions.map((p) => ({
        id: p._id?.toString(),
        symbol: p.symbol,
        exchange: p.exchange,
        side: p.side,
        qty: p.qty,
        avgPrice: p.avgPrice,
        ltp: p.ltp,
        pnl: p.pnl,
        pnlPct: p.pnlPct,
        currentValue: p.currentValue,
        investedValue: p.investedValue,
        productType: p.productType,
        optionType: p.optionType,
        strikePrice: p.strikePrice,
        expiry: p.expiry,
      })),
      summary: {
        totalInvested,
        totalCurrent,
        totalPnl,
        totalPnlPct,
        count: positions.length,
      },
    });
  } catch (err: any) {
    console.error("[trades/positions]", err);
    return NextResponse.json(
      { message: err.message || "Failed to load positions" },
      { status: 500 },
    );
  }
}
