import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { readScopedConfig, upsertScopedConfig } from "@/lib/scoped-config";

const DEFAULT_URL = "https://app.zerodha-pulse.in";

async function requireAdmin() {
  const cookieStore = await cookies();
  const c = cookieStore.get("ajx_admin");
  return c?.value === "ok";
}

export async function GET() {
  if (!(await requireAdmin())) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }
  const { config } = await readScopedConfig<{ apiUrl: string }>({
    key: "app_url",
    fallback: { apiUrl: DEFAULT_URL },
  });
  return NextResponse.json({ apiUrl: config.apiUrl || DEFAULT_URL });
}

export async function POST(req: NextRequest) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }
  const { apiUrl } = await req.json();
  const url = typeof apiUrl === "string" ? apiUrl.trim().replace(/\/$/, "") : "";
  await upsertScopedConfig({
    key: "app_url",
    userId: null,
    config: { apiUrl: url || DEFAULT_URL },
  });
  return NextResponse.json({ apiUrl: url || DEFAULT_URL });
}
