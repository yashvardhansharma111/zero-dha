"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { adminJson } from "@/components/admin/adminFetch";
import { ScopeUserBar } from "@/components/admin/ScopeUserBar";
import { computeOrderPnl } from "@/lib/admin-orders-pnl";

type OrderSegment = { key: string; label: string };

type OrderRow = {
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
  expiryDate?: string;
  changePct?: number;
  orderPrice?: number;
  qty: number;
  avgPrice: number;
  ltp: number;
  buyPrice?: number;
  sellPrice?: number;
  lots?: number;
  pnlManual?: boolean;
  pnlPct?: number;
  pnl: number;
  status: "OPEN" | "CLOSED";
  buyAt?: number;
  sellAt?: number;
};

const DEFAULT_SEGMENTS: OrderSegment[] = [
  { key: "positions", label: "Positions" },
  { key: "openOrders", label: "Open Orders" },
  { key: "baskets", label: "Baskets" },
  { key: "stockSip", label: "Stock SIP" },
  { key: "gtt", label: "GTT" },
];

let _rowCounter = 0;
function emptyRow(): OrderRow {
  _rowCounter += 1;
  const base = {
    id: `${Date.now()}-${_rowCounter}-${Math.random().toString(36).slice(2, 7)}`,
    symbol: "",
    market: "NSE",
    productType: "Delivery",
    optionType: "",
    strikePrice: 0,
    exchange: "NSE",
    orderTag: "At Market",
    expiryDate: "",
    changePct: 0,
    orderPrice: 0,
    avgPrice: 0,
    ltp: 0,
    qty: 0,
    buyPrice: 0,
    sellPrice: 0,
    lots: 1,
    pnlManual: false,
    pnlPct: 0,
    pnl: 0,
    side: "BUY" as const,
    segmentKey: "positions",
    status: "OPEN" as const,
  };
  return { ...base, pnl: computeOrderPnl(base) };
}

function patchRow(r: OrderRow, patch: Partial<OrderRow>): OrderRow {
  const next = { ...r, ...patch };
  if (!next.pnlManual) {
    next.pnl = computeOrderPnl(next);
  }
  return next;
}

type UserOpt = { _id: string; clientId?: string; email?: string; fullName?: string };

const inp =
  "min-w-[4rem] rounded border border-slate-200 bg-white px-1.5 py-1 text-xs text-slate-900 outline-none focus:border-emerald-500";
const inpNum = `${inp} text-right`;

export default function AdminOrdersPage() {
  const searchParams = useSearchParams();
  const initialScope = searchParams.get("scopeUserId") || "";
  const [users, setUsers] = useState<UserOpt[]>([]);
  const [scopeUserId, setScopeUserId] = useState(initialScope);
  const [segments, setSegments] = useState<OrderSegment[]>(DEFAULT_SEGMENTS);
  const [rows, setRows] = useState<OrderRow[]>([]);
  const [source, setSource] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [showOptionType, setShowOptionType] = useState(true);
  const [showSide, setShowSide] = useState(true);
  const [showStrike, setShowStrike] = useState(true);

  const totalPnl = useMemo(
    () => rows.reduce((a, o) => a + computeOrderPnl(o), 0),
    [rows],
  );

  const loadUsers = useCallback(async () => {
    try {
      const data = await adminJson<{ users: UserOpt[] }>("/api/admin/users");
      setUsers(data.users || []);
    } catch {
      /* ignore */
    }
  }, []);

  const loadConfig = useCallback(async () => {
    if (!scopeUserId.trim()) {
      setRows([]);
      setSegments(DEFAULT_SEGMENTS);
      return;
    }
    setErr(null);
    try {
      const data = await adminJson<{
        config?: {
          segments?: OrderSegment[];
          orders?: OrderRow[];
          showOptionType?: boolean;
          showSide?: boolean;
          showStrike?: boolean;
        };
        source?: string;
      }>(`/api/admin/orders?scopeUserId=${encodeURIComponent(scopeUserId)}`);
      const cfg = data.config || {};
      setShowOptionType(cfg.showOptionType !== false);
      setShowSide(cfg.showSide !== false);
      setShowStrike(cfg.showStrike !== false);
      const segs = cfg.segments;
      setSegments(
        Array.isArray(segs) && segs.length > 0 ? segs : DEFAULT_SEGMENTS,
      );
      const list = cfg.orders;
      setRows(
        Array.isArray(list)
          ? list.map((row) =>
              patchRow(
                {
                  ...row,
                  segmentKey: row.segmentKey || "positions",
                  market: row.market || "NSE",
                  productType: row.productType || "Delivery",
                  optionType: row.optionType || "",
                  exchange: row.exchange || row.market || "NSEFO",
                  orderTag: row.orderTag || "At Market",
                },
                {},
              ),
            )
          : [],
      );
      setSource(String(data.source || ""));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to load");
    }
  }, [scopeUserId]);

  useEffect(() => {
    void loadUsers();
  }, [loadUsers]);
  useEffect(() => {
    void loadConfig();
  }, [loadConfig]);

  async function save() {
    if (!scopeUserId.trim()) {
      setErr("Select a user before saving. Each config is per-user only.");
      return;
    }
    setSaving(true);
    setMsg(null);
    setErr(null);
    const summary = {
      dayPnl: rows.reduce((a, o) => a + computeOrderPnl(o), 0),
      totalPnl: rows.reduce((a, o) => a + computeOrderPnl(o), 0),
    };
    try {
      await adminJson("/api/admin/orders", {
        method: "POST",
        body: JSON.stringify({
          scopeUserId,
          config: {
            summary,
            segments,
            orders: rows,
            showOptionType,
            showSide,
            showStrike,
          },
        }),
      });
      setMsg("Positions saved for this user.");
      await loadConfig();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function resetScope() {
    if (!scopeUserId.trim()) {
      setErr("Select a user first.");
      return;
    }
    if (!confirm("Clear all position rows for this user?")) return;
    setSaving(true);
    try {
      await adminJson(`/api/admin/orders?scopeUserId=${encodeURIComponent(scopeUserId)}`, { method: "DELETE" });
      setMsg("Reset.");
      await loadConfig();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Reset failed");
    } finally {
      setSaving(false);
    }
  }

  async function clearGlobalConfig() {
    if (!confirm("Delete the global (shared) order config from the database? This removes trades that were saved without a specific user.")) return;
    setSaving(true);
    try {
      await adminJson("/api/admin/orders", { method: "DELETE" });
      setMsg("Global config cleared.");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Clear failed");
    } finally {
      setSaving(false);
    }
  }

  function updateRow(idx: number, patch: Partial<OrderRow>) {
    setRows((prev) =>
      prev.map((r, i) => (i === idx ? patchRow(r, patch) : r)),
    );
  }

  return (
    <div className="mx-auto max-w-[100rem]">
      <h2 className="text-lg font-semibold text-slate-900">Orders &amp; positions</h2>
      <p className="mt-1 text-sm text-slate-600">
        Select a user, add rows, set segment to <strong>positions</strong>, fill in P&amp;L, then <strong>Save</strong>. Rows with segment&nbsp;<em>positions</em> appear in the user&apos;s Positions tab.
      </p>
      {source ? <p className="mt-2 text-xs text-slate-500">Source: {source}</p> : null}
      {msg ? (
        <p className="mt-4 rounded-lg bg-emerald-50 px-4 py-2 text-sm text-emerald-900">{msg}</p>
      ) : null}
      {err ? (
        <p className="mt-4 rounded-lg bg-rose-50 px-4 py-2 text-sm text-rose-900">{err}</p>
      ) : null}

      <div className="mt-6">
        <ScopeUserBar
          scopeUserId={scopeUserId}
          onScopeChange={setScopeUserId}
          onLoad={() => void loadConfig()}
          users={users}
        />
      </div>

      {!scopeUserId.trim() && (
        <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <strong>Select a user above.</strong> Positions are per-user — no shared global trades.
        </div>
      )}
      {scopeUserId.trim() && (
        <div className="mb-4 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-950">
          <strong>Editing:</strong>{" "}
          {users.find((u) => u._id === scopeUserId)?.fullName ||
            users.find((u) => u._id === scopeUserId)?.email ||
            scopeUserId}
        </div>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
        <span className="text-xs font-medium text-slate-500">Combined P/L (derived)</span>
        <span className="font-mono text-sm font-semibold text-slate-900">
          {totalPnl.toLocaleString(undefined, { maximumFractionDigits: 2 })}
        </span>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving || !scopeUserId.trim()}
          className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save"}
        </button>
        <button
          type="button"
          onClick={() => void resetScope()}
          disabled={saving || !scopeUserId.trim()}
          className="rounded-lg border border-rose-200 px-4 py-2 text-sm text-rose-700 hover:bg-rose-50 disabled:opacity-50"
        >
          Reset
        </button>
        <button
          type="button"
          onClick={() => void clearGlobalConfig()}
          disabled={saving}
          className="rounded-lg border border-orange-300 px-4 py-2 text-sm text-orange-700 hover:bg-orange-50 disabled:opacity-50"
          title="Delete the shared global config saved without a user (removes global trades from the database)"
        >
          Clear global trades
        </button>
      </div>

      <section className="mb-8 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-slate-900">Segments</h3>
          <button
            type="button"
            className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-white"
            onClick={() =>
              setSegments((s) => [
                ...s,
                { key: `seg_${Date.now()}`, label: "New segment" },
              ])
            }
          >
            Add segment
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[320px] text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500">
                <th className="py-2 pr-2 font-medium">Key</th>
                <th className="py-2 pr-2 font-medium">Label</th>
                <th className="py-2 font-medium"> </th>
              </tr>
            </thead>
            <tbody>
              {segments.map((seg, i) => (
                <tr key={seg.key} className="border-b border-slate-100">
                  <td className="py-2 pr-2">
                    <input
                      className={inp}
                      value={seg.key}
                      onChange={(e) =>
                        setSegments((prev) =>
                          prev.map((s, j) =>
                            j === i ? { ...s, key: e.target.value } : s,
                          ),
                        )
                      }
                    />
                  </td>
                  <td className="py-2 pr-2">
                    <input
                      className={inp}
                      value={seg.label}
                      onChange={(e) =>
                        setSegments((prev) =>
                          prev.map((s, j) =>
                            j === i ? { ...s, label: e.target.value } : s,
                          ),
                        )
                      }
                    />
                  </td>
                  <td className="py-2">
                    <button
                      type="button"
                      className="text-rose-600 hover:underline"
                      onClick={() => setSegments((prev) => prev.filter((_, j) => j !== i))}
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mb-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h3 className="mb-3 text-sm font-semibold text-slate-900">Visibility in App</h3>
        <div className="flex flex-wrap gap-6">
          <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={showOptionType}
              onChange={(e) => setShowOptionType(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 accent-emerald-600"
            />
            Show CE / PE (Option Type)
          </label>
          <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={showSide}
              onChange={(e) => setShowSide(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 accent-emerald-600"
            />
            Show BUY / SELL (Side)
          </label>
          <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={showStrike}
              onChange={(e) => setShowStrike(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 accent-emerald-600"
            />
            Show Strike Price
          </label>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-slate-900">Order rows</h3>
          <button
            type="button"
            className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white"
            onClick={() => setRows((prev) => [...prev, emptyRow()])}
          >
            Add order
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-[11px]">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-slate-600">
                <th className="whitespace-nowrap px-1.5 py-2 font-medium">Segment</th>
                <th className="whitespace-nowrap px-1.5 py-2 font-medium">Mkt</th>
                <th className="whitespace-nowrap px-1.5 py-2 font-medium">Symbol</th>
                <th className="whitespace-nowrap px-1.5 py-2 font-medium">Side</th>
                <th className="whitespace-nowrap px-1.5 py-2 font-medium">Product</th>
                <th className="whitespace-nowrap px-1.5 py-2 font-medium">Expiry</th>
                <th className="whitespace-nowrap px-1.5 py-2 font-medium">Opt</th>
                <th className="whitespace-nowrap px-1.5 py-2 font-medium">Strike</th>
                <th className="whitespace-nowrap px-1.5 py-2 font-medium">Exch</th>
                <th className="whitespace-nowrap px-1.5 py-2 font-medium">Tag</th>
                <th className="whitespace-nowrap px-1.5 py-2 font-medium">Chg %</th>
                <th className="whitespace-nowrap px-1.5 py-2 font-medium">Buy</th>
                <th className="whitespace-nowrap px-1.5 py-2 font-medium">Sell</th>
                <th className="whitespace-nowrap px-1.5 py-2 font-medium">Ord px</th>
                <th className="whitespace-nowrap px-1.5 py-2 font-medium">Lots</th>
                <th className="whitespace-nowrap px-1.5 py-2 font-medium">Qty</th>
                <th className="whitespace-nowrap px-1.5 py-2 font-medium">Avg</th>
                <th className="whitespace-nowrap px-1.5 py-2 font-medium">LTP</th>
                <th className="whitespace-nowrap px-1.5 py-2 font-medium">P/L</th>
                <th className="whitespace-nowrap px-1.5 py-2 font-medium">Man</th>
                <th className="whitespace-nowrap px-1.5 py-2 font-medium">P/L %</th>
                <th className="whitespace-nowrap px-1.5 py-2 font-medium">Status</th>
                <th className="whitespace-nowrap px-1.5 py-2 font-medium text-emerald-700">Buy@</th>
                <th className="whitespace-nowrap px-1.5 py-2 font-medium text-rose-600">Sell@</th>
                <th className="whitespace-nowrap px-1.5 py-2 font-medium"> </th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={25} className="px-3 py-6 text-center text-slate-500">
                    No rows. Click &quot;Add order&quot; to create one.
                  </td>
                </tr>
              ) : (
                rows.map((row, idx) => (
                  <tr key={`${row.id}-${idx}`} className="border-b border-slate-100 hover:bg-slate-50/80">
                    <td className="px-1.5 py-1 align-top">
                      <select
                        className={inp}
                        value={row.segmentKey || "positions"}
                        onChange={(e) => updateRow(idx, { segmentKey: e.target.value })}
                      >
                        {segments.map((seg) => (
                          <option key={seg.key} value={seg.key}>
                            {seg.label}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-1.5 py-1 align-top">
                      <input
                        className={inp}
                        value={row.market || ""}
                        onChange={(e) => updateRow(idx, { market: e.target.value })}
                      />
                    </td>
                    <td className="px-1.5 py-1 align-top">
                      <input
                        className={inp}
                        value={row.symbol}
                        onChange={(e) => updateRow(idx, { symbol: e.target.value })}
                      />
                    </td>
                    <td className="px-1.5 py-1 align-top">
                      <select
                        className={inp}
                        value={row.side}
                        onChange={(e) =>
                          updateRow(idx, { side: e.target.value as OrderRow["side"] })
                        }
                      >
                        <option value="BUY">BUY</option>
                        <option value="SELL">SELL</option>
                      </select>
                    </td>
                    <td className="px-1.5 py-1 align-top">
                      <select
                        className={inp}
                        value={row.productType || "Delivery"}
                        onChange={(e) => updateRow(idx, { productType: e.target.value })}
                      >
                        <option value="Delivery">Delivery</option>
                        <option value="Intraday">Intraday</option>
                        <option value="F&O">F&amp;O</option>
                        <option value="CNC">CNC</option>
                        <option value="MIS">MIS</option>
                      </select>
                    </td>
                    <td className="px-1.5 py-1 align-top">
                      <input
                        type="date"
                        className={inp}
                        value={row.expiryDate || ""}
                        onChange={(e) => updateRow(idx, { expiryDate: e.target.value })}
                      />
                    </td>
                    <td className="px-1.5 py-1 align-top">
                      <select
                        className={inp}
                        value={row.optionType || ""}
                        onChange={(e) => updateRow(idx, { optionType: e.target.value })}
                      >
                        <option value="">— Equity</option>
                        <option value="CE">CE</option>
                        <option value="PE">PE</option>
                      </select>
                    </td>
                    <td className="px-1.5 py-1 align-top">
                      <input
                        type="number"
                        step="any"
                        className={inpNum}
                        value={row.strikePrice ?? 0}
                        onChange={(e) =>
                          updateRow(idx, { strikePrice: Number(e.target.value || 0) })
                        }
                      />
                    </td>
                    <td className="px-1.5 py-1 align-top">
                      <input
                        className={inp}
                        value={row.exchange || ""}
                        onChange={(e) => updateRow(idx, { exchange: e.target.value })}
                      />
                    </td>
                    <td className="px-1.5 py-1 align-top">
                      <select
                        className={inp}
                        value={row.orderTag || "At Market"}
                        onChange={(e) => updateRow(idx, { orderTag: e.target.value })}
                      >
                        <option value="At Market">At Market</option>
                        <option value="At Limit">At Limit</option>
                      </select>
                    </td>
                    <td className="px-1.5 py-1 align-top">
                      <input
                        type="number"
                        step="any"
                        className={inpNum}
                        value={row.changePct ?? 0}
                        onChange={(e) =>
                          updateRow(idx, { changePct: Number(e.target.value || 0) })
                        }
                      />
                    </td>
                    <td className="px-1.5 py-1 align-top">
                      <input
                        type="number"
                        step="any"
                        className={inpNum}
                        value={row.buyPrice ?? 0}
                        onChange={(e) =>
                          updateRow(idx, { buyPrice: Number(e.target.value || 0) })
                        }
                      />
                    </td>
                    <td className="px-1.5 py-1 align-top">
                      <input
                        type="number"
                        step="any"
                        className={inpNum}
                        value={row.sellPrice ?? 0}
                        onChange={(e) =>
                          updateRow(idx, { sellPrice: Number(e.target.value || 0) })
                        }
                      />
                    </td>
                    <td className="px-1.5 py-1 align-top">
                      <input
                        type="number"
                        step="any"
                        className={inpNum}
                        value={row.orderPrice ?? row.avgPrice ?? 0}
                        onChange={(e) =>
                          updateRow(idx, { orderPrice: Number(e.target.value || 0) })
                        }
                      />
                    </td>
                    <td className="px-1.5 py-1 align-top">
                      <input
                        type="number"
                        step="any"
                        className={inpNum}
                        value={row.lots ?? 0}
                        onChange={(e) =>
                          updateRow(idx, { lots: Number(e.target.value || 0) })
                        }
                      />
                    </td>
                    <td className="px-1.5 py-1 align-top">
                      <input
                        type="number"
                        step="any"
                        className={inpNum}
                        value={row.qty ?? 0}
                        onChange={(e) =>
                          updateRow(idx, { qty: Number(e.target.value || 0) })
                        }
                      />
                    </td>
                    <td className="px-1.5 py-1 align-top">
                      <input
                        type="number"
                        step="any"
                        className={inpNum}
                        value={row.avgPrice ?? 0}
                        onChange={(e) =>
                          updateRow(idx, { avgPrice: Number(e.target.value || 0) })
                        }
                      />
                    </td>
                    <td className="px-1.5 py-1 align-top">
                      <input
                        type="number"
                        step="any"
                        className={inpNum}
                        value={row.ltp ?? 0}
                        onChange={(e) =>
                          updateRow(idx, { ltp: Number(e.target.value || 0) })
                        }
                      />
                    </td>
                    <td className="px-1.5 py-1 align-top">
                      <input
                        type="number"
                        step="any"
                        className={inpNum}
                        value={row.pnl ?? 0}
                        onChange={(e) =>
                          updateRow(idx, {
                            pnl: Number(e.target.value || 0),
                            pnlManual: true,
                          })
                        }
                      />
                    </td>
                    <td className="px-1.5 py-1 pt-2 align-top">
                      <input
                        type="checkbox"
                        checked={!!row.pnlManual}
                        onChange={(e) =>
                          updateRow(idx, {
                            pnlManual: e.target.checked,
                            pnl: e.target.checked
                              ? row.pnl
                              : computeOrderPnl({ ...row, pnlManual: false }),
                          })
                        }
                      />
                    </td>
                    <td className="px-1.5 py-1 align-top">
                      <input
                        type="number"
                        step="any"
                        className={inpNum}
                        value={row.pnlPct ?? 0}
                        onChange={(e) =>
                          updateRow(idx, { pnlPct: Number(e.target.value || 0) })
                        }
                      />
                    </td>
                    <td className="px-1.5 py-1 align-top">
                      <select
                        className={inp}
                        value={row.status}
                        onChange={(e) =>
                          updateRow(idx, {
                            status: e.target.value as OrderRow["status"],
                          })
                        }
                      >
                        <option value="OPEN">OPEN</option>
                        <option value="CLOSED">CLOSED</option>
                      </select>
                    </td>
                    <td className="px-1.5 py-1 align-top">
                      <input
                        type="number"
                        step="any"
                        placeholder="—"
                        className={inpNum}
                        value={row.buyAt ?? ""}
                        onChange={(e) =>
                          updateRow(idx, { buyAt: e.target.value === "" ? undefined : Number(e.target.value) })
                        }
                      />
                    </td>
                    <td className="px-1.5 py-1 align-top">
                      <input
                        type="number"
                        step="any"
                        placeholder="—"
                        className={inpNum}
                        value={row.sellAt ?? ""}
                        onChange={(e) =>
                          updateRow(idx, { sellAt: e.target.value === "" ? undefined : Number(e.target.value) })
                        }
                      />
                    </td>
                    <td className="px-1.5 py-1 align-top">
                      <button
                        type="button"
                        className="whitespace-nowrap text-rose-600 hover:underline"
                        onClick={() => setRows((prev) => prev.filter((_, i) => i !== idx))}
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
