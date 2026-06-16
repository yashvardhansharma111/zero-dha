/**
 * Angel One SmartAPI session manager.
 * Handles login with TOTP, token caching, and auto-refresh.
 */
import { generateSync, TOTP } from "otplib";

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

// Persist across Next.js hot reloads in dev — otherwise every edit re-runs
// the TOTP login (~3s). In prod serverless this is a no-op within a warm lambda.
declare global {
  // eslint-disable-next-line no-var
  var __angelSession: SessionTokens | null | undefined;
}

function getCached(): SessionTokens | null {
  return globalThis.__angelSession ?? null;
}
function setCached(v: SessionTokens | null) {
  globalThis.__angelSession = v;
}

/** Session valid for 23 hours (Angel tokens expire in 24h). */
const SESSION_TTL_MS = 23 * 60 * 60 * 1000;

function getEnv(key: string): string {
  const v = process.env[key];
  if (!v) throw new Error(`Missing env: ${key}`);
  return v;
}

function apiKey() {
  return getEnv("ANGELONE_API_KEY");
}

export async function login(): Promise<SessionTokens> {
  const clientCode = getEnv("ANGELONE_CLIENT_CODE");
  const mpin = getEnv("ANGELONE_MPIN");
  const totpSecret = getEnv("ANGELONE_TOTP_SECRET");
  const key = apiKey();

  const totp = generateSync({ secret: totpSecret });

  const res = await fetch(
    `${BASE}/rest/auth/angelbroking/user/v1/loginByPassword`,
    {
      method: "POST",
      headers: { ...COMMON_HEADERS, "X-PrivateKey": key },
      body: JSON.stringify({
        clientcode: clientCode,
        password: mpin,
        totp,
      }),
    },
  );

  const json = await res.json();
  if (!json.status || !json.data?.jwtToken) {
    throw new Error(
      `Angel login failed: ${json.message || JSON.stringify(json)}`,
    );
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
  if (c && Date.now() - c.loginTime < SESSION_TTL_MS) {
    return c;
  }
  return login();
}

export async function authHeaders(): Promise<Record<string, string>> {
  const s = await getSession();
  return {
    ...COMMON_HEADERS,
    Authorization: `Bearer ${s.jwtToken}`,
    "X-PrivateKey": apiKey(),
  };
}

async function parseJson(res: Response) {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Angel One returned non-JSON (session may have expired): ${text.slice(0, 120)}`);
  }
}

/** Authenticated POST to SmartAPI. */
export async function angelPost(path: string, body: unknown) {
  const headers = await authHeaders();
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  const json = await parseJson(res);

  // Token expired → clear cache, re-login once, retry
  if (json.message?.toLowerCase().includes("invalid token") ||
      json.message?.toLowerCase().includes("access denied")) {
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
}

export function getFeedToken(): string | null {
  return getCached()?.feedToken ?? null;
}

export function getClientCode(): string {
  return process.env.ANGELONE_CLIENT_CODE || "";
}
