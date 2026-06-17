import { NextRequest, NextResponse } from "next/server";
import { angelPost } from "@/lib/angelone/session";
import {
  getOptionChainInstruments,
  getExpiries,
  INDEX_TOKENS,
} from "@/lib/angelone/instruments";

const QUOTE_CACHE_TTL_MS = 60_000; // 60 s — keep Angel One under rate limit
declare global {
  // eslint-disable-next-line no-var
  var __optionQuoteCache: Map<string, { data: unknown; fetchedAt: number }> | undefined;
}
const quoteCache: Map<string, { data: unknown; fetchedAt: number }> =
  globalThis.__optionQuoteCache ||
  (globalThis.__optionQuoteCache = new Map());

/**
 * GET /api/angel/option-chain?symbol=NIFTY&expiry=25APR2026
 * GET /api/angel/option-chain?symbol=NIFTY  (returns nearest expiry)
 *
 * Returns CE/PE option chain with live LTP for each strike.
 */
export async function GET(request: NextRequest) {
  try {
    const sp = request.nextUrl.searchParams;
    const symbol = (sp.get("symbol") || "NIFTY").toUpperCase();
    let expiry = sp.get("expiry") || "";
    const exchange = sp.get("exchange") || "NFO";

    // If no expiry, find nearest
    if (!expiry) {
      const expiries = await getExpiries(symbol, exchange);
      if (!expiries.length) {
        return NextResponse.json(
          { error: `No options found for ${symbol}` },
          { status: 404 },
        );
      }
      expiry = expiries[0]; // Nearest expiry
    }

    // Full-response cache keyed by symbol+expiry+exchange — avoids hammering Angel One
    const cacheKey = `${symbol}:${exchange}:${expiry}`;
    const cached = quoteCache.get(cacheKey);
    if (cached && Date.now() - cached.fetchedAt < QUOTE_CACHE_TTL_MS) {
      console.log("[angel/option-chain] cache hit —", cacheKey, `age=${Math.round((Date.now() - cached.fetchedAt) / 1000)}s`);
      return NextResponse.json(cached.data);
    }
    console.log("[angel/option-chain] cache miss —", cacheKey);

    // Get all CE/PE instruments for this expiry
    const { calls: allCalls, puts: allPuts } = await getOptionChainInstruments(
      symbol,
      expiry,
      exchange,
    );

    if (!allCalls.length && !allPuts.length) {
      return NextResponse.json(
        { error: `No options for ${symbol} expiry ${expiry}` },
        { status: 404 },
      );
    }

    // Fetch spot price first (needed to pick ATM strikes)
    let spotPrice = 0;
    const idxInfo = INDEX_TOKENS[symbol];
    if (idxInfo) {
      const spotResult = await angelPost(
        "/rest/secure/angelbroking/market/v1/quote/",
        {
          mode: "LTP",
          exchangeTokens: { [idxInfo.exchange]: [idxInfo.token] },
        },
      );
      if (spotResult.status && spotResult.data?.fetched?.[0]) {
        spotPrice = Number(spotResult.data.fetched[0].ltp);
      }
    } else {
      // For stocks/commodities — spot = underlying equity/futures LTP
      const { findBySymbol, resolveTradable } = await import("@/lib/angelone/instruments");
      const underlyingExchange = exchange === "NFO" ? "NSE" : exchange === "BFO" ? "BSE" : "MCX";
      // For MCX, use resolveTradable to find the nearest futures contract (FUTCOM).
      // findBySymbol won't work because MCX symbols include expiry (e.g. "CRUDEOIL25APR2026FUT").
      const inst =
        underlyingExchange === "MCX"
          ? await resolveTradable("MCX", symbol)
          : (await findBySymbol(underlyingExchange, symbol)) ||
            (await findBySymbol(underlyingExchange, `${symbol}-EQ`));
      if (inst) {
        const spotResult = await angelPost(
          "/rest/secure/angelbroking/market/v1/quote/",
          { mode: "LTP", exchangeTokens: { [inst.exch_seg]: [inst.token] } },
        );
        if (spotResult.status && spotResult.data?.fetched?.[0]) {
          spotPrice = Number(spotResult.data.fetched[0].ltp);
        }
      }
    }

    // Limit to strikes near ATM — huge perf win (200+ strikes → ~40)
    // Use all unique strikes, sorted, pick ~20 on each side of spot
    const STRIKE_WINDOW = Number(sp.get("strikes")) || 20;
    const allStrikes = [...new Set([...allCalls.map((c) => c.strike), ...allPuts.map((p) => p.strike)])].sort(
      (a, b) => a - b,
    );
    let strikeFilter: Set<number>;
    if (spotPrice > 0 && allStrikes.length > STRIKE_WINDOW * 2) {
      const atmIdx = allStrikes.reduce(
        (best, _, idx) =>
          Math.abs(allStrikes[idx] - spotPrice) < Math.abs(allStrikes[best] - spotPrice) ? idx : best,
        0,
      );
      const start = Math.max(0, atmIdx - STRIKE_WINDOW);
      const end = Math.min(allStrikes.length, atmIdx + STRIKE_WINDOW + 1);
      strikeFilter = new Set(allStrikes.slice(start, end));
    } else {
      strikeFilter = new Set(allStrikes);
    }

    const calls = allCalls.filter((c) => strikeFilter.has(c.strike));
    const puts = allPuts.filter((p) => strikeFilter.has(p.strike));

    // Collect all option tokens for batch quote
    const nfoTokens: string[] = [];
    const tokenToInstrument = new Map<string, any>();

    for (const c of calls) {
      nfoTokens.push(c.token);
      tokenToInstrument.set(c.token, { ...c, optionType: "CE" });
    }
    for (const p of puts) {
      nfoTokens.push(p.token);
      tokenToInstrument.set(p.token, { ...p, optionType: "PE" });
    }

    // Batch quote (max 50 per request for Angel)
    const quoteMap = new Map<string, any>();
    const BATCH = 50;
    for (let i = 0; i < nfoTokens.length; i += BATCH) {
      const batch = nfoTokens.slice(i, i + BATCH);
      const qResult = await angelPost(
        "/rest/secure/angelbroking/market/v1/quote/",
        {
          mode: "FULL",
          exchangeTokens: { [exchange]: batch },
        },
      );
      if (qResult.status && qResult.data?.fetched) {
        for (const q of qResult.data.fetched) {
          quoteMap.set(q.symbolToken || q.symboltoken, q);
        }
      }
    }

    // Build strike-indexed chain
    const strikeMap = new Map<number, Record<string, any>>();

    for (const [tok, inst] of tokenToInstrument.entries()) {
      const quote = quoteMap.get(tok);
      const row: Record<string, any> = strikeMap.get(inst.strike) || {
        strike: inst.strike,
      };

      const entry = {
        symbol: inst.symbol,
        token: inst.token,
        ltp: quote?.ltp ?? 0,
        change: quote?.netChange ?? 0,
        changePct: quote?.percentChange ?? 0,
        oi: quote?.opnInterest ?? 0,
        oiChange: quote?.oiChange ?? 0,
        volume: quote?.tradeVolume ?? 0,
        bidPrice: quote?.bestBidPrice ?? 0,
        askPrice: quote?.bestAskPrice ?? 0,
        iv: 0,
        lotSize: inst.lotsize,
      };

      if (inst.optionType === "CE") row.CE = entry;
      else row.PE = entry;

      strikeMap.set(inst.strike, row);
    }

    // Sort by strike
    const chain = [...strikeMap.values()].sort(
      (a, b) => a.strike - b.strike,
    );

    // Find ATM strike
    let atmStrike = 0;
    if (spotPrice > 0 && chain.length) {
      atmStrike = chain.reduce((prev, curr) =>
        Math.abs(curr.strike - spotPrice) < Math.abs(prev.strike - spotPrice)
          ? curr
          : prev,
      ).strike;
    }

    // Get all available expiries for the dropdown
    const expiries = await getExpiries(symbol, exchange);

    const responseData = { symbol, expiry, exchange, spotPrice, atmStrike, expiries, chain };
    quoteCache.set(cacheKey, { data: responseData, fetchedAt: Date.now() });
    return NextResponse.json(responseData);
  } catch (err: any) {
    console.error("[angel/option-chain]", err);
    return NextResponse.json(
      { error: err.message || "Internal error" },
      { status: 500 },
    );
  }
}
