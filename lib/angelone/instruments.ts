/**
 * Angel One scrip master — downloads once, caches in memory for the day.
 * Provides symbol→token lookup, option chain discovery, and search.
 */

const SCRIP_MASTER_URL =
  "https://margincalculator.angelbroking.com/OpenAPI_File/files/OpenAPIScripMaster.json";

export interface Instrument {
  token: string;
  symbol: string;
  name: string;
  expiry: string;       // "25APR2026" or ""
  strike: number;       // -1 for non-options
  lotsize: number;
  instrumenttype: string; // "OPTIDX", "OPTSTK", "FUTIDX", "FUTSTK", "EQ", ""
  exch_seg: string;     // "NSE", "NFO", "BSE", "BFO", "MCX"
  tick_size: number;
}

interface ScripCache {
  data: Instrument[];
  byToken: Map<string, Instrument>;
  bySymbol: Map<string, Instrument>;
  fetchedAt: number;
}

// Persist across Next.js dev hot reloads. Scrip master is ~30MB / 100k rows,
// re-downloading it on every code edit is brutal.
declare global {
  // eslint-disable-next-line no-var
  var __scripCache: ScripCache | null | undefined;
  // eslint-disable-next-line no-var
  var __scripCachePromise: Promise<ScripCache> | undefined;
}

const CACHE_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours

export async function loadInstruments(): Promise<ScripCache> {
  const current = globalThis.__scripCache;
  if (current && Date.now() - current.fetchedAt < CACHE_TTL_MS) return current;

  // De-dupe concurrent callers: if a download is already in flight, await it.
  if (globalThis.__scripCachePromise) return globalThis.__scripCachePromise;

  const downloadPromise = (async () => {
    console.log("[instruments] Downloading scrip master...");
    const res = await fetch(SCRIP_MASTER_URL);
    const raw: any[] = await res.json();

    const data: Instrument[] = raw.map((r) => ({
      token: r.token,
      symbol: r.symbol,
      name: r.name || r.symbol,
      expiry: r.expiry || "",
      strike: r.strike != null ? Number(r.strike) / 100 : -1, // Angel stores strike * 100
      lotsize: Number(r.lotsize) || 1,
      instrumenttype: r.instrumenttype || "",
      exch_seg: r.exch_seg || "",
      tick_size: Number(r.tick_size) || 0.05,
    }));

    const byToken = new Map<string, Instrument>();
    const bySymbol = new Map<string, Instrument>();
    for (const i of data) {
      byToken.set(`${i.exch_seg}:${i.token}`, i);
      bySymbol.set(`${i.exch_seg}:${i.symbol}`, i);
    }

    const cache: ScripCache = { data, byToken, bySymbol, fetchedAt: Date.now() };
    globalThis.__scripCache = cache;
    console.log(`[instruments] Loaded ${data.length} instruments`);
    return cache;
  })();

  globalThis.__scripCachePromise = downloadPromise;
  try {
    return await downloadPromise;
  } finally {
    globalThis.__scripCachePromise = undefined;
  }
}

/** Lookup by exchange:symbol (e.g. "NSE:RELIANCE-EQ") */
export async function findBySymbol(
  exchange: string,
  symbol: string,
): Promise<Instrument | undefined> {
  const c = await loadInstruments();
  return c.bySymbol.get(`${exchange}:${symbol}`);
}

/**
 * Resolve a "tradable" instrument — what the user sees as the ticker.
 * For NSE/BSE: equity. For MCX: nearest-month FUT contract. For exact option symbol: that option.
 */
export async function resolveTradable(
  exchange: string,
  symbol: string,
): Promise<Instrument | undefined> {
  const c = await loadInstruments();
  const upper = symbol.toUpperCase();

  // Exact symbol match first (covers full option symbols + .EQ)
  const direct = c.bySymbol.get(`${exchange}:${upper}`);
  if (direct) return direct;

  // NSE/BSE: try with -EQ suffix for equity
  const eq = c.bySymbol.get(`${exchange}:${upper}-EQ`);
  if (eq) return eq;

  // MCX: find nearest-month future for this underlying.
  // Match by name field (authoritative). If name is empty or inconsistent in the scrip
  // master for a given commodity, fall back to symbol-prefix match (strip digits/expiry).
  if (exchange === "MCX") {
    const futures: Instrument[] = [];
    for (const i of c.data) {
      if (i.exch_seg !== "MCX") continue;
      if (i.instrumenttype !== "FUTCOM") continue;
      const nameUp = i.name.toUpperCase();
      const nameMatch = nameUp === upper;
      // e.g. "CRUDEOIL25APR2026FUT" → strip trailing digits/expiry → "CRUDEOIL"
      const symBase = i.symbol.replace(/\d.*$/, "").toUpperCase();
      const symMatch = symBase === upper;
      // Fallback: partial match covers abbreviations / name casing variants
      const nameContains = nameUp.includes(upper) || upper.includes(nameUp);
      if (!nameMatch && !symMatch && !nameContains) continue;
      futures.push(i);
    }
    if (futures.length) {
      futures.sort(
        (a, b) => parseAngelExpiry(a.expiry).getTime() - parseAngelExpiry(b.expiry).getTime(),
      );
      const now = Date.now();
      const resolved = futures.find((f) => parseAngelExpiry(f.expiry).getTime() > now) || futures[0];
      console.log(`[resolveTradable] MCX:${symbol} → ${resolved.symbol} (name="${resolved.name}" token=${resolved.token})`);
      return resolved;
    }
    console.warn(`[resolveTradable] MCX:${symbol} — no FUTCOM found. Searched ${c.data.filter(i=>i.exch_seg==="MCX"&&i.instrumenttype==="FUTCOM").length} MCX futures.`);
  }

  // NFO/BFO options: fallback parse when exact symbol match fails.
  // Handles 2-digit year compact format (e.g. NIFTY21APR2624550CE → looks up NIFTY21APR202624550CE).
  if (exchange === "NFO" || exchange === "BFO") {
    const m = upper.match(/^([A-Z]+)(\d{2}[A-Z]{3}\d{2,4})(\d+)(CE|PE)$/);
    if (m) {
      const underlying = m[1];
      let expStr = m[2];
      const strike = Number(m[3]);
      const optType = m[4];
      // Normalize 2-digit year: "21APR26" (7 chars) → "21APR2026"
      if (expStr.length === 7) {
        expStr = expStr.slice(0, 5) + "20" + expStr.slice(5);
      }
      for (const i of c.data) {
        if (i.exch_seg !== exchange) continue;
        if (i.name.toUpperCase() !== underlying) continue;
        if (i.expiry !== expStr) continue;
        if (Math.round(i.strike) !== strike) continue;
        if (!i.symbol.endsWith(optType)) continue;
        console.log(`[resolveTradable] ${exchange}:${symbol} → ${i.symbol} via component parse`);
        return i;
      }
    }
  }

  return undefined;
}

/** Lookup by exchange:token */
export async function findByToken(
  exchange: string,
  token: string,
): Promise<Instrument | undefined> {
  const c = await loadInstruments();
  return c.byToken.get(`${exchange}:${token}`);
}

/** Search instruments by keyword (name or symbol). */
export async function searchInstruments(
  query: string,
  exchange?: string,
  limit = 20,
): Promise<Instrument[]> {
  const c = await loadInstruments();
  const q = query.toUpperCase();
  const results: Instrument[] = [];
  const seenCommodity = new Set<string>(); // dedupe MCX futures by underlying name

  for (const i of c.data) {
    if (exchange && i.exch_seg !== exchange) continue;

    const isEquity =
      i.exch_seg === "NSE" || i.exch_seg === "BSE"
        ? i.instrumenttype === "" ||
          i.instrumenttype === "EQ" ||
          i.symbol.endsWith("-EQ")
        : false;
    const isCommodityFut = i.exch_seg === "MCX" && i.instrumenttype === "FUTCOM";

    if (!isEquity && !isCommodityFut) continue;

    const hay = `${i.symbol} ${i.name}`.toUpperCase();
    if (!hay.includes(q)) continue;

    // For MCX commodities, only return one entry per underlying (the nearest expiry wins
    // because scrip master is roughly sorted and we keep the first match)
    if (isCommodityFut) {
      const key = i.name.toUpperCase();
      if (seenCommodity.has(key)) continue;
      seenCommodity.add(key);
    }

    results.push(i);
    if (results.length >= limit) break;
  }
  return results;
}

/** Memoized option-chain lookup — cleared when scrip master refreshes. */
declare global {
  // eslint-disable-next-line no-var
  var __optionChainCache:
    | Map<string, { calls: Instrument[]; puts: Instrument[]; fetchedAt: number }>
    | undefined;
  // eslint-disable-next-line no-var
  var __expiryCache:
    | Map<string, { expiries: string[]; fetchedAt: number }>
    | undefined;
}
const optionChainCache =
  globalThis.__optionChainCache ||
  (globalThis.__optionChainCache = new Map<
    string,
    { calls: Instrument[]; puts: Instrument[]; fetchedAt: number }
  >());
const OPTION_CACHE_TTL_MS = 30 * 60 * 1000; // 30 min

/** Get option chain instruments for a given underlying + expiry. */
export async function getOptionChainInstruments(
  underlying: string,
  expiry: string, // "25APR2026"
  exchange = "NFO",
): Promise<{ calls: Instrument[]; puts: Instrument[] }> {
  const key = `${exchange}:${underlying}:${expiry}`;
  const hit = optionChainCache.get(key);
  if (hit && Date.now() - hit.fetchedAt < OPTION_CACHE_TTL_MS) {
    return { calls: hit.calls, puts: hit.puts };
  }

  const c = await loadInstruments();
  const calls: Instrument[] = [];
  const puts: Instrument[] = [];

  for (const i of c.data) {
    if (i.exch_seg !== exchange) continue;
    if (i.expiry !== expiry) continue;
    // OPTIDX=index options, OPTSTK=stock options, OPTFUT=commodity options on MCX
    if (
      i.instrumenttype !== "OPTIDX" &&
      i.instrumenttype !== "OPTSTK" &&
      i.instrumenttype !== "OPTFUT"
    )
      continue;
    // Match by name (authoritative underlying) not symbol prefix
    if (i.name.toUpperCase() !== underlying.toUpperCase()) continue;

    if (i.symbol.endsWith("CE")) calls.push(i);
    else if (i.symbol.endsWith("PE")) puts.push(i);
  }

  calls.sort((a, b) => a.strike - b.strike);
  puts.sort((a, b) => a.strike - b.strike);

  optionChainCache.set(key, { calls, puts, fetchedAt: Date.now() });
  return { calls, puts };
}

/** Memoized expiries lookup. */
const expiryCache =
  globalThis.__expiryCache ||
  (globalThis.__expiryCache = new Map<
    string,
    { expiries: string[]; fetchedAt: number }
  >());

/** Get unique expiry dates for an underlying on NFO/BFO. */

export async function getExpiries(
  underlying: string,
  exchange = "NFO",
): Promise<string[]> {
  const key = `${exchange}:${underlying}`;
  const hit = expiryCache.get(key);
  if (hit && Date.now() - hit.fetchedAt < OPTION_CACHE_TTL_MS) {
    return hit.expiries;
  }

  const c = await loadInstruments();
  const expirySet = new Set<string>();

  for (const i of c.data) {
    if (i.exch_seg !== exchange) continue;
    if (!i.expiry) continue;
    // OPTIDX=index options, OPTSTK=stock options, OPTFUT=commodity options on MCX
    if (
      i.instrumenttype !== "OPTIDX" &&
      i.instrumenttype !== "OPTSTK" &&
      i.instrumenttype !== "OPTFUT"
    )
      continue;
    if (i.name.toUpperCase() !== underlying.toUpperCase()) continue;
    expirySet.add(i.expiry);
  }

  const expiries = [...expirySet].sort(
    (a, b) => parseAngelExpiry(a).getTime() - parseAngelExpiry(b).getTime(),
  );
  expiryCache.set(key, { expiries, fetchedAt: Date.now() });
  return expiries;
}

/** Parse "25APR2026" → Date */
export function parseAngelExpiry(exp: string): Date {
  const months: Record<string, number> = {
    JAN: 0, FEB: 1, MAR: 2, APR: 3, MAY: 4, JUN: 5,
    JUL: 6, AUG: 7, SEP: 8, OCT: 9, NOV: 10, DEC: 11,
  };
  const day = parseInt(exp.slice(0, 2), 10);
  const mon = months[exp.slice(2, 5)] ?? 0;
  const year = parseInt(exp.slice(5), 10);
  return new Date(year, mon, day);
}

/** Well-known index tokens for quick lookup. */
export const INDEX_TOKENS: Record<string, { exchange: string; token: string }> =
  {
    NIFTY: { exchange: "NSE", token: "99926000" },
    BANKNIFTY: { exchange: "NSE", token: "99926009" },
    FINNIFTY: { exchange: "NSE", token: "99926037" },
    SENSEX: { exchange: "BSE", token: "99919000" },
    MIDCPNIFTY: { exchange: "NSE", token: "99926074" },
  };
