/**
 * Angel One SmartAPI session manager.
 * Handles login with TOTP, token caching, and auto-refresh.
 *
 * All REST calls are serialized through a global queue with a minimum gap
 * between each request to stay under Angel One's rate limits.
 * A circuit breaker trips on any rate-limit response and blocks new calls
 * for 30 s to let the quota recover.
 */
import { generateSync } from "otplib";

const BASE = "https://apiconnect.angelone.in";

const COMMON_HEADERS = {
  "Content-Type": "application/json",
  Accept: "application/json",
  "X-UserType": "USER",
  "X-SourceID": "WEB",
  "X-ClientLocalIP": "127.0.0.1",
  "X-ClientPublicIP": "127.0.0.1",
  "X-MACAddress": "aa:bb:cc:dd:ee:ff",
};

interface SessionTokens {
  jwtToken: string;
  refreshToken: string;
  feedToken: string;
  loginTime: number;
}

declare global {
  // eslint-disable-next-line no-var
  var __angelSession: SessionTokens | null | undefined;
  // eslint-disable-next-line no-var
  var __angelQueue: Promise<void> | undefined;
  // eslint-disable-next-line no-var
  var __angelRateLimitedAt: number | undefined;
}

const SESSION_TTL_MS = 23 * 60 * 60 * 1000;
const MIN_GAP_MS = 700;            // ms enforced between consecutive Angel One calls
const CIRCUIT_BACKOFF_MS = 30_000; // ms to block all calls after a rate-limit hit

function getCached(): SessionTokens | null { return globalThis.__angelSession ?? null; }
function setCached(v: SessionTokens | null) { globalThis.__angelSession = v; }

function circuitOpen(): boolean {
  return Date.now() - (globalThis.__angelRateLimitedAt ?? 0) < CIRCUIT_BACKOFF_MS;
}
function tripCircuit() {
  globalThis.__angelRateLimitedAt = Date.now();
  console.warn("[Angel One] Rate-limit hit — blocking all calls for 30 s");
}

function isRateLimit(text: string) {
  const lc = text.toLowerCase();
  return lc.includes("rate") || lc.includes("exceeding") || lc.includes("too many");
}
function isTokenExpired(text: string) {
  const lc = text.toLowerCase();
  // Only treat "access denied" as token expiry when it is NOT about rate limiting
  return lc.includes("invalid token") || lc.includes("unauthorized") ||
    (lc.includes("access denied") && !isRateLimit(lc));
}

function getEnv(key: string): string {
  const v = process.env[key];
  if (!v) throw new Error(`Missing env: ${key}`);
  return v;
}
function apiKey() { return getEnv("ANGELONE_API_KEY"); }

export async function login(): Promise<SessionTokens> {
  const clientCode = getEnv("ANGELONE_CLIENT_CODE");
  const mpin = getEnv("ANGELONE_MPIN");
  const totpSecret = getEnv("ANGELONE_TOTP_SECRET");
  const key = apiKey();
  const totp = generateSync({ secret: totpSecret });

  const res = await fetch(`${BASE}/rest/auth/angelbroking/user/v1/loginByPassword`, {
    method: "POST",
    headers: { ...COMMON_HEADERS, "X-PrivateKey": key },
    body: JSON.stringify({ clientcode: clientCode, password: mpin, totp }),
  });
  const json = await res.json();
  if (!json.status || !json.data?.jwtToken) {
    throw new Error(`Angel login failed: ${json.message || JSON.stringify(json)}`);
  }
  const session: SessionTokens = {
    jwtToken: json.data.jwtToken,
    refreshToken: json.data.refreshToken,
    feedToken: json.data.feedToken,
    loginTime: Date.now(),
  };
  setCached(session);
  return session;
}

export async function getSession(): Promise<SessionTokens> {
  const c = getCached();
  if (c && Date.now() - c.loginTime < SESSION_TTL_MS) return c;
  return login();
}

export async function authHeaders(): Promise<Record<string, string>> {
  const s = await getSession();
  return { ...COMMON_HEADERS, Authorization: `Bearer ${s.jwtToken}`, "X-PrivateKey": apiKey() };
}

async function parseJson(res: Response): Promise<unknown> {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Angel One returned non-JSON (session may have expired): ${text.slice(0, 200)}`);
  }
}

/**
 * Serializing queue: ensures only ONE Angel One REST call is in-flight at a time,
 * with at least MIN_GAP_MS between the end of one call and the start of the next.
 */
async function enqueue<T>(fn: () => Promise<T>): Promise<T> {
  const prev = globalThis.__angelQueue ?? Promise.resolve();
  let unlock!: () => void;
  const next = new Promise<void>((r) => { unlock = r; });
  globalThis.__angelQueue = next;

  // Wait for the previous slot to finish (including its enforced gap)
  await prev;

  let result: T;
  let threw: unknown;
  let didThrow = false;
  try {
    result = await fn();
  } catch (e) {
    threw = e;
    didThrow = true;
  } finally {
    // Always enforce the gap before releasing the next waiter
    await new Promise((r) => setTimeout(r, MIN_GAP_MS));
    unlock();
  }

  if (didThrow) throw threw;
  return result!;
}

/** Authenticated POST to SmartAPI — serialized + circuit-broken. */
export async function angelPost(path: string, body: unknown): Promise<unknown> {
  if (circuitOpen()) {
    const remaining = Math.ceil(
      (CIRCUIT_BACKOFF_MS - (Date.now() - (globalThis.__angelRateLimitedAt ?? 0))) / 1000,
    );
    throw new Error(`Angel One rate-limited — retry in ${remaining}s`);
  }

  return enqueue(async () => {
    const headers = await authHeaders();
    const res = await fetch(`${BASE}${path}`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });

    let json: unknown;
    try {
      json = await parseJson(res);
    } catch (e: unknown) {
      // parseJson threw — response was non-JSON (rate limit HTML/text page, etc.)
      const msg = (e as Error).message ?? "";
      if (isRateLimit(msg)) tripCircuit();
      throw e;
    }

    const j = json as { message?: string };

    if (j.message && isRateLimit(j.message)) {
      tripCircuit();
      throw new Error(`Angel One rate-limited: ${j.message}`);
    }

    // Session token expired → re-login once and retry (no extra enqueue, we're already in the slot)
    if (j.message && isTokenExpired(j.message)) {
      setCached(null);
      const h2 = await authHeaders();
      const r2 = await fetch(`${BASE}${path}`, {
        method: "POST",
        headers: h2,
        body: JSON.stringify(body),
      });
      return parseJson(r2);
    }

    return json;
  });
}

export function getFeedToken(): string | null { return getCached()?.feedToken ?? null; }
export function getClientCode(): string { return process.env.ANGELONE_CLIENT_CODE || ""; }
