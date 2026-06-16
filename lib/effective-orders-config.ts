import { ObjectId } from "mongodb";
import { getDb } from "@/lib/mongodb";

/** Same shape as admin / config orders */
export type OrderRowEffective = {
  expiryDate: string;
  id: string;
  segmentKey: string;
  market?: string;
  symbol: string;
  side: "BUY" | "SELL";
  productType?: string;
  optionType?: string;
  strikePrice?: number;
  exchange?: string;
  orderTag?: string;
  changePct?: number;
  filledLots?: number;
  totalLots?: number;
  orderPrice?: number;
  qty: number;
  lotSize?: number;
  startDate?: string;
  avgPrice: number;
  ltp: number;
  buyPrice?: number;
  sellPrice?: number;
  lots?: number;
  pnlManual?: boolean;
  pnlPct?: number;
  pnl: number;
  status: "OPEN" | "CLOSED";
  time?: string;
  buyAt?: number;
  sellAt?: number;
};

export type OrdersConfigEffective = {
  summary?: { dayPnl: number; totalPnl: number };
  segments: Array<{ key: string; label: string }>;
  orders: OrderRowEffective[];
  showOptionType?: boolean;
  showSide?: boolean;
  showStrike?: boolean;
};

const KEY = "dashboard_orders";

const empty: OrdersConfigEffective = {
  summary: { dayPnl: 0, totalPnl: 0 },
  segments: [],
  orders: [],
};

/**
 * Global orders + optional per-user overrides (same id replaces global row).
 * If there is no per-user document, returns global only.
 */
export async function getEffectiveOrdersConfigForUser(
  userId: string | null | undefined,
): Promise<OrdersConfigEffective> {
  const db = await getDb();
  const settings = db.collection("settings");

  async function loadGlobal(): Promise<OrdersConfigEffective> {
    const doc = await settings.findOne<{ value?: OrdersConfigEffective }>({
      key: KEY,
      userId: null,
    });
    if (doc?.value) return normalize(doc.value);
    const legacy = await settings.findOne<{ value?: OrdersConfigEffective }>({
      key: KEY,
      userId: { $exists: false },
    });
    if (legacy?.value) return normalize(legacy.value);
    return { ...empty };
  }

  function normalize(c: OrdersConfigEffective): OrdersConfigEffective {
    return {
      summary: c.summary ?? { dayPnl: 0, totalPnl: 0 },
      segments: Array.isArray(c.segments) ? c.segments : [],
      orders: Array.isArray(c.orders) ? c.orders : [],
      showOptionType: c.showOptionType,
      showSide: c.showSide,
    };
  }

  const global = await loadGlobal();

  if (!userId || !ObjectId.isValid(userId)) {
    return global;
  }

  const userDoc = await settings.findOne<{ value?: OrdersConfigEffective }>({
    key: KEY,
    userId: new ObjectId(userId),
  });

  if (!userDoc?.value) {
    return global;
  }

  const u = normalize(userDoc.value);
  const gOrders = global.orders;
  const uOrders = u.orders;

  const byId = new Map(gOrders.map((o) => [o.id, o]));
  for (const row of uOrders) {
    byId.set(row.id, row);
  }

  return {
    ...global,
    ...u,
    summary: u.summary ?? global.summary,
    segments:
      u.segments.length > 0 ? u.segments : global.segments.length > 0 ? global.segments : [],
    orders: Array.from(byId.values()),
    showOptionType: u.showOptionType ?? global.showOptionType,
    showSide: u.showSide ?? global.showSide,
    showStrike: u.showStrike ?? global.showStrike,
  };
}
