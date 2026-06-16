"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { adminJson } from "@/components/admin/adminFetch";

type BankDetails = {
  accountNo?: string;
  ifscCode?: string;
  documentType?: string;
};

type UserDetail = {
  _id: string;
  fullName?: string | null;
  email?: string | null;
  phone?: string | null;
  clientId?: string | null;
  status?: string | null;
  panNumber?: string | null;
  aadhaarNumber?: string | null;
  bankDetails?: BankDetails | null;
  tradingBalance?: number;
  margin?: number;
  createdAt?: string | null;
  activatedAt?: string | null;
  documentPreviews?: Record<string, string | null>;
  signatureUploadThingUrl?: string | null;
};

type FundReq = {
  _id: string;
  type: string;
  amount: number;
  method: string;
  reference: string;
  note: string;
  status: string;
  createdAt?: string | null;
  hasProof: boolean;
};

function InfoRow({ label, value }: { label: string; value?: string | number | null }) {
  return (
    <div className="flex items-baseline gap-3 border-b border-slate-100 py-2.5">
      <span className="w-40 shrink-0 text-xs font-medium uppercase text-slate-500">
        {label}
      </span>
      <span className="text-sm text-slate-900">{value ?? "—"}</span>
    </div>
  );
}

function DocPreview({
  label,
  dataUri,
  fallbackUrl,
}: {
  label: string;
  dataUri?: string | null;
  fallbackUrl?: string | null;
}) {
  const src = dataUri || fallbackUrl;
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <p className="mb-3 text-xs font-semibold uppercase text-slate-500">{label}</p>
      {src ? (
        <a href={src} target="_blank" rel="noopener noreferrer">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={src}
            alt={label}
            className="max-h-64 rounded-lg border border-slate-100 object-contain"
          />
        </a>
      ) : (
        <p className="text-sm text-slate-400">Not uploaded</p>
      )}
    </div>
  );
}

export default function AdminUserDetailsPage() {
  const searchParams = useSearchParams();
  const userId = searchParams.get("id");

  const [user, setUser] = useState<UserDetail | null>(null);
  const [fundRequests, setFundRequests] = useState<FundReq[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    setErr(null);
    try {
      const data = await adminJson<{ user: UserDetail; fundRequests?: FundReq[] }>(
        `/api/admin/user-details?userId=${encodeURIComponent(userId)}`,
      );
      setUser(data.user || null);
      setFundRequests(data.fundRequests || []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!userId) {
    return (
      <div className="mx-auto max-w-3xl py-12 text-center text-slate-500">
        No user ID provided.{" "}
        <Link href="/admin/users" className="text-emerald-600 hover:underline">
          Back to users
        </Link>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-3xl py-12 text-center text-slate-500">
        Loading…
      </div>
    );
  }

  if (err || !user) {
    return (
      <div className="mx-auto max-w-3xl py-12">
        <p className="rounded-lg bg-rose-50 px-4 py-2 text-sm text-rose-900">
          {err || "User not found"}
        </p>
        <Link
          href="/admin/users"
          className="mt-4 inline-block text-sm text-emerald-600 hover:underline"
        >
          ← Back to users
        </Link>
      </div>
    );
  }

  const docs = user.documentPreviews || {};

  return (
    <div className="mx-auto max-w-4xl">
      <Link
        href="/admin/users"
        className="mb-4 inline-block text-sm text-emerald-600 hover:underline"
      >
        ← Back to users
      </Link>

      <h2 className="text-lg font-semibold text-slate-900">
        {user.fullName || "Unnamed"}{" "}
        {user.clientId ? (
          <span className="text-base font-normal text-slate-500">
            ({user.clientId})
          </span>
        ) : null}
      </h2>

      <div className="mt-2 flex items-center gap-3">
        <span
          className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
            user.status === "active"
              ? "bg-emerald-100 text-emerald-800"
              : user.status === "blocked"
                ? "bg-rose-100 text-rose-800"
                : "bg-amber-100 text-amber-800"
          }`}
        >
          {user.status || "—"}
        </span>
        <span className="text-xs text-slate-500">
          ID: <code className="rounded bg-slate-100 px-1 text-[11px]">{user._id}</code>
        </span>
      </div>

      {/* Quick-jump nav */}
      <div className="mt-5 flex flex-wrap gap-2">
        {[
          { href: "#info", label: "Personal info" },
          { href: "#bank", label: "Bank details" },
          { href: "#account", label: "Account" },
          { href: "#documents", label: "Documents" },
          { href: "#positions", label: "Positions & Orders" },
          { href: "#payments", label: "Payment History" },
        ].map((t) => (
          <a
            key={t.href}
            href={t.href}
            className="rounded-full border border-slate-200 px-3.5 py-1.5 text-xs font-medium text-slate-700 transition hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-800"
          >
            {t.label}
          </a>
        ))}
      </div>

      {/* Personal info */}
      <section id="info" className="mt-8 scroll-mt-8 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="mb-3 font-medium text-slate-900">Personal information</h3>
        <InfoRow label="Full name" value={user.fullName} />
        <InfoRow label="Email" value={user.email} />
        <InfoRow label="Phone" value={user.phone} />
        <InfoRow label="PAN number" value={user.panNumber} />
        <InfoRow label="Aadhaar number" value={user.aadhaarNumber} />
      </section>

      {/* Bank details */}
      <section id="bank" className="mt-6 scroll-mt-8 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="mb-3 font-medium text-slate-900">Bank details</h3>
        <InfoRow label="Account number" value={user.bankDetails?.accountNo} />
        <InfoRow label="IFSC code" value={user.bankDetails?.ifscCode} />
        <InfoRow label="Document type" value={user.bankDetails?.documentType} />
      </section>

      {/* Financials */}
      <section id="account" className="mt-6 scroll-mt-8 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="mb-3 font-medium text-slate-900">Account</h3>
        <InfoRow label="Trading balance" value={user.tradingBalance} />
        <InfoRow label="Margin" value={user.margin} />
        <InfoRow
          label="Registered"
          value={user.createdAt ? new Date(user.createdAt).toLocaleString() : null}
        />
        <InfoRow
          label="Activated"
          value={user.activatedAt ? new Date(user.activatedAt).toLocaleString() : null}
        />
      </section>

      {/* Documents */}
      <section id="documents" className="mt-6 scroll-mt-8">
        <h3 className="mb-4 font-medium text-slate-900">Uploaded documents</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <DocPreview label="Profile photo" dataUri={docs.photo} />
          <DocPreview
            label="Signature"
            dataUri={docs.signature}
            fallbackUrl={user.signatureUploadThingUrl}
          />
          <DocPreview label="Bank proof" dataUri={docs.bankProof} />
          <DocPreview label="Supporting document" dataUri={docs.document} />
        </div>
      </section>

      {/* Payment History */}
      <section id="payments" className="mt-6 scroll-mt-8">
        <h3 className="mb-4 font-medium text-slate-900">Payment history</h3>
        {fundRequests.length === 0 ? (
          <p className="text-sm text-slate-400">No fund requests yet.</p>
        ) : (
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[700px] text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
                    <th className="px-3 py-2">Type</th>
                    <th className="px-3 py-2 text-right">Amount</th>
                    <th className="px-3 py-2">Reference</th>
                    <th className="px-3 py-2">Note</th>
                    <th className="px-3 py-2">Proof</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {fundRequests.map((r) => (
                    <tr key={r._id} className="border-b border-slate-50 hover:bg-slate-50/50">
                      <td className="px-3 py-2 capitalize text-slate-700">{r.type}</td>
                      <td className="px-3 py-2 text-right tabular-nums font-medium text-slate-900">
                        ₹{r.amount?.toLocaleString("en-IN")}
                      </td>
                      <td className="px-3 py-2 max-w-[160px] truncate text-slate-600">
                        {r.reference || "—"}
                      </td>
                      <td className="px-3 py-2 max-w-[200px] truncate text-slate-500">
                        {r.note || "—"}
                      </td>
                      <td className="px-3 py-2">
                        {r.hasProof ? (
                          <a
                            href={`/api/admin/funds/proof/${r._id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 rounded bg-sky-50 px-2 py-0.5 text-xs font-medium text-sky-700 hover:bg-sky-100"
                          >
                            View ↗
                          </a>
                        ) : (
                          <span className="text-xs text-slate-400">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2">
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
                      <td className="px-3 py-2 text-xs text-slate-500">
                        {r.createdAt ? new Date(r.createdAt).toLocaleDateString() : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>

      {/* Quick link to orders scoped to this user */}
      <section id="positions" className="mt-8 mb-8 scroll-mt-8 rounded-2xl border border-emerald-200 bg-emerald-50 p-5 shadow-sm">
        <h3 className="mb-2 font-medium text-slate-900">Positions &amp; Orders</h3>
        <p className="text-sm text-slate-600">
          Manage this user&apos;s positions, P&amp;L, and order history from the Orders page scoped to their ID.
        </p>
        <Link
          href={`/admin/orders?scopeUserId=${encodeURIComponent(user._id)}`}
          className="mt-3 inline-block rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
        >
          Manage positions for {user.fullName || user.clientId || "this user"}
        </Link>
      </section>
    </div>
  );
}
