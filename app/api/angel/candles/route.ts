import { NextRequest, NextResponse } from "next/server";
import { angelPost, circuitOpen } from "@/lib/angelone/session";
import { INDEX_TOKENS, resolveTradable } from "@/lib/angelone/instruments";

/**
 * GET /api/angel/candles?symbol=RELIANCE&exchange=NSE&interval=ONE_DAY&range=1M
 *
 * Returns OHLCV candle array from Angel One historical API.
 * Supports: ONE_MINUTE, FIVE_MINUTE, FIFTEEN_MINUTE, THIRTY_MINUTE, ONE_HOUR, ONE_DAY
 */

// Cache candle responses to avoid hammering Angel One on every chart view.
// Intraday (1D) refreshes every 60s; longer ranges (daily candles) refresh every 10min.
declare global {
  // eslint-disable-next-line no-var
  var __candleCache: Map<string, { data: unknown; fetchedAt: number }> | undefined;
}
const candleCache: Map<string, { data: unknown; fetchedAt: number }> =
  globalThis.__candleCache || (globalThis.__candleCache = new Map());

const CANDLE_CACHE_TTL: Record<string, number> = {
  "1D": 60_000,       // 1 min — intraday, 5-min candles
  "1W": 300_000,      // 5 min
  "1M": 600_000,      // 10 min
  "3M": 600_000,
  "6M": 600_000,
  "1Y": 600_000,
};

const RANGE_MAP: Record<string, { days: number; interval: string }> = {
  "1D": { days: 1, interval: "FIVE_MINUTE" },
  "1W": { days: 7, interval: "FIFTEEN_MINUTE" },
  "1M": { days: 30, interval: "ONE_DAY" },
  "3M": { days: 90, interval: "ONE_DAY" },
  "6M": { days: 180, interval: "ONE_DAY" },
  "1Y": { days: 365, interval: "ONE_DAY" },
};

function formatDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const h = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${y}-${m}-${day} ${h}:${min}`;
}

export async function GET(request: NextRequest) {
  try {
    const sp = request.nextUrl.searchParams;
    const symbolName = sp.get("symbol") || "NIFTY";
    const exchange = sp.get("exchange") || "NSE";
    const range = sp.get("range") || "1D";
    const intervalOverride = sp.get("interval");

    // Resolve symbol token (handles indices, equities, options, MCX futures)
    let token: string | undefined;
    let resolvedExchange = exchange;
    const idxEntry = INDEX_TOKENS[symbolName.toUpperCase()];
    if (idxEntry) {
      token = idxEntry.token;
      resolvedExchange = idxEntry.exchange;
    } else {
      const inst = await resolveTradable(exchange, symbolName);
      if (inst) {
        token = inst.token;
        resolvedExchange = inst.exch_seg;
      }
    }

    if (!token) {
      return NextResponse.json(
        { error: `Symbol not found: ${exchange}:${symbolName}` },
        { status: 404 },
      );
    }

    const rangeConfig = RANGE_MAP[range] || RANGE_MAP["1D"];
    const interval = intervalOverride || rangeConfig.interval;

    // Check cache before hitting Angel One
    const cacheKey = `${resolvedExchange}:${token}:${range}:${interval}`;
    const cacheTtl = CANDLE_CACHE_TTL[range] ?? 60_000;
    const cached = candleCache.get(cacheKey);
    if (cached && Date.now() - cached.fetchedAt < cacheTtl) {
      console.log("[angel/candles] cache hit —", cacheKey, `age=${Math.round((Date.now() - cached.fetchedAt) / 1000)}s`);
      return NextResponse.json(cached.data);
    }
    // Circuit open (rate-limited) — serve stale cache rather than 500
    if (circuitOpen() && cached) {
      console.log("[angel/candles] circuit open, serving stale cache —", cacheKey);
      return NextResponse.json(cached.data);
    }

    const toDate = new Date();
    const fromDate = new Date(
      toDate.getTime() - rangeConfig.days * 24 * 60 * 60 * 1000,
    );

    // Intraday start-of-day: MCX opens 09:00 IST, NSE/BSE open 09:15 IST.
    // Use UTC equivalents (IST = UTC+5:30) so the server timezone doesn't matter.
    // MCX 09:00 IST = 03:30 UTC | NSE 09:15 IST = 03:45 UTC
    if (range === "1D") {
      const mcx = resolvedExchange === "MCX";
      fromDate.setUTCHours(3, mcx ? 30 : 45, 0, 0);
    }

    const body = {
      exchange: resolvedExchange,
      symboltoken: token,
      interval,
      fromdate: formatDate(fromDate),
      todate: formatDate(toDate),
    };

    const result = await angelPost(
      "/rest/secure/angelbroking/historical/v1/getCandleData",
      body,
    );

    if (!result.status || !result.data) {
      return NextResponse.json(
        { error: result.message || "Failed to fetch candle data" },
        { status: 502 },
      );
    }

    // Angel returns [[timestamp, O, H, L, C, V], ...]
    const candles = (result.data as any[]).map(
      ([time, open, high, low, close, volume]: any[]) => ({
        time: new Date(time).getTime() / 1000, // Unix seconds
        open: Number(open),
        high: Number(high),
        low: Number(low),
        close: Number(close),
        volume: Number(volume),
      }),
    );

    const responseData = { symbol: symbolName, exchange, range, interval, candles };
    candleCache.set(cacheKey, { data: responseData, fetchedAt: Date.now() });
    return NextResponse.json(responseData);
  } catch (err: any) {
    console.error("[angel/candles]", err);
    return NextResponse.json(
      { error: err.message || "Internal error" },
      { status: 500 },
    );
  }
}
