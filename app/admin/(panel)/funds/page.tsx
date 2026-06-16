"use client";

import { useCallback, useEffect, useState } from "react";
import { adminJson } from "@/components/admin/adminFetch";

type Req = {
  _id: string;
  type?: string;
  userName: string;
  userEmail: string;
  amount: number;
  reference?: string;
  note?: string;
  status: string;
  createdAt?: string;
  hasProof?: boolean;
};

export default function AdminFundsPage() {
  const [requests, setRequests] = useState<Req[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const data = await adminJson<{ requests: Req[] }>("/api/admin/funds");
      setRequests(data.requests || []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function approve(id: string) {
    setMsg(null);
    setErr(null);
    try {
      await adminJson("/api/admin/funds/approve", {
        method: "POST",
        body: JSON.stringify({ requestId: id }),
      });
      setMsg("Approved.");
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed");
    }
  }

  async function reject(id: string) {
    setMsg(null);
    setErr(null);
    try {
      await adminJson("/api/admin/funds/reject", {
        method: "POST",
        body: JSON.stringify({ requestId: id }),
      });
      setMsg("Rejected.");
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed");
    }
  }

  return (
    <div className="mx-auto max-w-7xl">
      <h2 className="text-lg font-semibold text-slate-900">Fund requests</h2>
      <p className="mt-1 text-sm text-slate-600">Review add-fund and withdraw requests.</p>
      {msg ? (
        <p className="mt-4 rounded-lg bg-emerald-50 px-4 py-2 text-sm text-emerald-900">{msg}</p>
      ) : null}
      {err ? (
        <p className="mt-4 rounded-lg bg-rose-50 px-4 py-2 text-sm text-rose-900">{err}</p>
      ) : null}

      <div className="mt-6 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
                <th className="px-3 py-3">User</th>
                <th className="px-3 py-3">Type</th>
                <th className="px-3 py-3 text-right">Amount</th>
                <th className="px-3 py-3">Reference</th>
                <th className="px-3 py-3">Proof</th>
                <th className="px-3 py-3">Status</th>
                <th className="px-3 py-3">Created</th>
                <th className="px-3 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={8} className="px-3 py-8 text-center text-slate-500">
                    Loading…
                  </td>
                </tr>
              ) : requests.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-3 py-8 text-center text-slate-500">
                    No requests.
                  </td>
                </tr>
              ) : (
                requests.map((r) => (
                  <tr key={r._id} className="border-b border-slate-50 hover:bg-slate-50/50">
                    <td className="px-3 py-3">
                      <div className="font-medium text-slate-900">{r.userName}</div>
                      <div className="text-xs text-slate-500">{r.userEmail}</div>
                    </td>
                    <td className="px-3 py-3 capitalize text-slate-700">{r.type || "add"}</td>
                    <td className="px-3 py-3 text-right tabular-nums font-medium text-slate-900">
                      ₹{r.amount?.toLocaleString("en-IN")}
                    </td>
                    <td className="px-3 py-3 max-w-[180px] truncate text-slate-600">
                      {r.reference || "—"}
                    </td>
                    <td className="px-3 py-3">
                      {r.hasProof ? (
                        <a
                          href={`/api/admin/funds/proof/${r._id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 rounded bg-sky-50 px-2 py-0.5 text-xs font-medium text-sky-700 hover:bg-sky-100"
                        >
                          View proof ↗
                        </a>
                      ) : (
                        <span className="text-xs text-slate-400">—</span>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                          r.status === "approved"
                            ? "bg-emerald-100 text-emerald-800"
                            : r.status === "rejected"
                              ? "bg-rose-100 text-rose-800"
                              : "bg-amber-100 text-amber-800"
                        }`}
                      >
                        {r.status}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-xs text-slate-500">
                      {r.createdAt
                        ? new Date(r.createdAt).toLocaleString()
                        : "—"}
                    </td>
                    <td className="px-3 py-3">
                      {r.status === "pending" ? (
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => void approve(r._id)}
                            className="rounded bg-emerald-600 px-3 py-1 text-xs font-medium text-white hover:bg-emerald-700"
                          >
                            Approve
                          </button>
                          <button
                            type="button"
                            onClick={() => void reject(r._id)}
                            className="rounded border border-rose-200 px-3 py-1 text-xs font-medium text-rose-700 hover:bg-rose-50"
                          >
                            Reject
                          </button>
                        </div>
                      ) : (
                        <span className="text-xs text-slate-400">—</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
