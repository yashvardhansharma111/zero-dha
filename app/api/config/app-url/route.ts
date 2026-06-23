import { NextResponse } from "next/server";
import { readScopedConfig } from "@/lib/scoped-config";

const DEFAULT_URL = "https://app.zerodha-pulse.in";

/** GET /api/config/app-url — public, no auth required.
 *  Returns the API base URL the mobile app should use.
 *  Admin can override via /api/admin/app-url.
 */
export async function GET() {
  try {
    const { config } = await readScopedConfig<{ apiUrl: string }>({
      key: "app_url",
      fallback: { apiUrl: DEFAULT_URL },
    });
    return NextResponse.json({ apiUrl: config.apiUrl || DEFAULT_URL });
  } catch {
    return NextResponse.json({ apiUrl: DEFAULT_URL });
  }
}
