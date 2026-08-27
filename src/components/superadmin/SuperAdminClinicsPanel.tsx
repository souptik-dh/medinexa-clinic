"use client";
import React, { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import Badge from "@/components/ui/badge/Badge";
import { Modal } from "@/components/ui/modal";
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  ApiError,
  SubscriptionPayment,
  SubscriptionStatus,
  SuperAdminClinicDetail,
  SuperAdminClinicListItem,
  superAdminApi,
} from "@/lib/api";
import {
  formatCurrency,
  formatDate,
  formatDateTime,
  subscriptionPaymentStatusColor,
  subscriptionStatusColor,
  subscriptionStatusLabel,
} from "@/lib/utils";
import { useTranslation } from "@/hooks/useTranslation";

export default function SuperAdminClinicsPanel() {
  const { t } = useTranslation();
  const STATUS_OPTIONS: { value: string; label: string }[] = [
    { value: "", label: t("appointments.allStatuses") },
    { value: "TRIAL", label: t("status.freeTrial") },
    { value: "ACTIVE", label: t("status.active") },
    { value: "EXPIRED", label: t("status.expired") },
    { value: "INACTIVE", label: t("status.inactive") },
  ];
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [items, setItems] = useState<SuperAdminClinicListItem[]>([]);
  const [cursor, setCursor] = useState<string | undefined>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [detail, setDetail] = useState<SuperAdminClinicDetail | null>(null);
  const [payments, setPayments] = useState<SubscriptionPayment[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);

  // actions
  const [actionBusy, setActionBusy] = useState(false);
  const [deactivateOpen, setDeactivateOpen] = useState(false);
  const [deactivateReason, setDeactivateReason] = useState("");
  const [extendOpen, setExtendOpen] = useState(false);
  const [extendMonths, setExtendMonths] = useState(1);
  const [extendTrialDays, setExtendTrialDays] = useState(0);
  const [extendReason, setExtendReason] = useState("");

  useEffect(() => {
    const url = new URL(window.location.href);
    const s = url.searchParams.get("status");
    if (s) setStatus(s);
  }, []);

  const load = useCallback(
    async (nextCursor?: string, append = false) => {
      setLoading(true);
      setError(null);
      try {
        const res = await superAdminApi.clinics({
          q: q || undefined,
          subscription_status: (status || undefined) as SubscriptionStatus | undefined,
          limit: nextCursor ? undefined : 20,
          cursor: nextCursor,
        });
        setItems((prev) => (append ? [...prev, ...res.items] : res.items));
        setCursor(res.next_cursor ?? undefined);
      } catch (err) {
        if (!append) setItems([]);
        setError(err instanceof ApiError ? err.message : t("billing.failedToLoadClinics"));
      } finally {
        setLoading(false);
      }
    },
    [q, status, t]
  );

  useEffect(() => {
    const t = setTimeout(() => load(), q ? 350 : 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, status]);

  const openDetail = async (clinicId: string) => {
    setDetailLoading(true);
    try {
      const [d, p] = await Promise.all([
        superAdminApi.clinic(clinicId),
        superAdminApi.clinicPayments(clinicId),
      ]);
      setDetail(d);
      setPayments(p.items);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t("superAdminClinics.failedToLoadClinic"));
    } finally {
      setDetailLoading(false);
    }
  };

  const refreshDetail = async () => {
    if (!detail) return;
    await openDetail(detail.id);
    load();
  };

  const handleActivate = async () => {
    if (!detail) return;
    setActionBusy(true);
    try {
      const res = await superAdminApi.activateClinic(detail.id);
      toast.success(res.message || t("superAdminClinics.clinicActivated"));
      await refreshDetail();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t("superAdminClinics.failedToActivateClinic"));
    } finally {
      setActionBusy(false);
    }
  };

  const handleDeactivate = async () => {
    if (!detail) return;
    setActionBusy(true);
    try {
      const res = await superAdminApi.deactivateClinic(detail.id, deactivateReason.trim());
      toast.success(res.message || t("superAdminClinics.clinicDeactivated"));
      setDeactivateOpen(false);
      setDeactivateReason("");
      await refreshDetail();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t("superAdminClinics.failedToDeactivateClinic"));
    } finally {
      setActionBusy(false);
    }
  };

  const handleExtend = async () => {
    if (!detail) return;
    setActionBusy(true);
    try {
      const months = extendMonths > 0 ? extendMonths : undefined;
      const trialDays = extendTrialDays > 0 ? extendTrialDays : undefined;
      const res = await superAdminApi.extendSubscription(detail.id, {
        ...(months ? { months } : {}),
        ...(trialDays && !months ? { trial_days: trialDays } : {}),
        reason: extendReason.trim(),
      });
      toast.success(res.message || t("superAdminClinics.subscriptionExtended"));
      setExtendOpen(false);
      setExtendMonths(1);
      setExtendTrialDays(0);
      setExtendReason("");
      await refreshDetail();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t("superAdminClinics.failedToExtendSubscription"));
    } finally {
      setActionBusy(false);
    }
  };

  const sub = detail?.subscription;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03] sm:flex-row sm:p-6">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t("superAdminClinics.searchByClinicOrOwner")}
          className="h-11 flex-1 rounded-lg border border-gray-300 bg-transparent px-3 text-sm text-gray-800 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
        />
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="h-11 rounded-lg border border-gray-300 bg-transparent px-3 text-sm text-gray-800 focus:border-brand-300 focus:outline-hidden dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
        >
          {STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]">
        {error && (
          <p className="p-6 text-sm text-error-500">{error}</p>
        )}
        {!error && items.length === 0 && !loading && (
          <p className="py-8 text-center text-sm text-gray-500 dark:text-gray-400">
            {t("superAdminClinics.noClinicsFound")}
          </p>
        )}
        {items.length > 0 && (
          <div className="overflow-x-auto p-4 sm:p-6">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableCell isHeader className="px-4 py-3 text-left text-xs font-semibold uppercase text-gray-500 dark:text-gray-400">
                    {t("superAdminClinics.clinic")}
                  </TableCell>
                  <TableCell isHeader className="px-4 py-3 text-left text-xs font-semibold uppercase text-gray-500 dark:text-gray-400">
                    {t("superAdminClinics.owner")}
                  </TableCell>
                  <TableCell isHeader className="px-4 py-3 text-left text-xs font-semibold uppercase text-gray-500 dark:text-gray-400">
                    {t("superAdminClinics.branches")}
                  </TableCell>
                  <TableCell isHeader className="px-4 py-3 text-left text-xs font-semibold uppercase text-gray-500 dark:text-gray-400">
                    {t("dashboard.status")}
                  </TableCell>
                  <TableCell isHeader className="px-4 py-3 text-left text-xs font-semibold uppercase text-gray-500 dark:text-gray-400">
                    {t("superAdminClinics.daysLeft")}
                  </TableCell>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((c) => (
                  <TableRow
                    key={c.id}
                    onClick={() => openDetail(c.id)}
                    className="cursor-pointer hover:bg-gray-50 dark:hover:bg-white/[0.03]"
                  >
                    <TableCell className="px-4 py-3">
                      <p className="text-sm font-medium text-gray-800 dark:text-white/90">{c.name}</p>
                      {c.city && (
                        <span className="block text-xs text-gray-400">{c.city}</span>
                      )}
                    </TableCell>
                    <TableCell className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">
                      {c.owner?.email}
                    </TableCell>
                    <TableCell className="px-4 py-3 text-sm text-gray-800 dark:text-white/90">
                      {c.branch_count}
                    </TableCell>
                    <TableCell className="px-4 py-3">
                      {c.subscription ? (
                        <Badge color={subscriptionStatusColor(c.subscription.status)}>
                          {subscriptionStatusLabel(c.subscription.status, t)}
                        </Badge>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell className="px-4 py-3 text-sm text-gray-800 dark:text-white/90">
                      {c.subscription?.days_remaining ?? "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {cursor && (
              <div className="mt-3 text-center">
                <button
                  onClick={() => load(cursor, true)}
                  disabled={loading}
                  className="text-sm font-medium text-brand-500 hover:underline disabled:opacity-60"
                >
                  {loading ? t("common.loading") : t("patients.loadMore")}
                </button>
              </div>
            )}
          </div>
        )}
        {loading && items.length === 0 && (
          <p className="py-8 text-center text-sm text-gray-400">{t("common.loading")}</p>
        )}
      </div>

      {/* Detail modal */}
      <Modal isOpen={detailLoading || !!detail} onClose={() => setDetail(null)} className="max-w-3xl p-6">
        {detailLoading && <p className="py-10 text-center text-sm text-gray-400">{t("superAdminClinics.loadingClinic")}</p>}
        {!detailLoading && detail && (
          <div className="max-h-[75vh] space-y-5 overflow-y-auto">
            <div>
              <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">{detail.name}</h3>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                {t("superAdminClinics.ownerLine", {
                  name: detail.owner?.name ?? "",
                  email: detail.owner?.email ?? "",
                  location: [detail.location?.city, detail.location?.district].filter(Boolean).join(", ") || "—",
                })}
              </p>
            </div>

            {/* Licenses */}
            <div className="rounded-xl border border-gray-200 p-4 text-sm dark:border-gray-800">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">{t("licenses.title")}</p>
              <ul className="space-y-1 text-gray-600 dark:text-gray-400">
                <li>{t("licenses.tradeLicense")}: {detail.licenses?.trade_license_number || "—"}</li>
                <li>{t("licenses.drugLicense")}: {detail.licenses?.drug_license_number || "—"}</li>
                <li>{t("licenses.clinicalEstablishmentRegistration")}: {detail.licenses?.clinical_establishment_reg_number || "—"}</li>
              </ul>
            </div>

            {/* Subscription + actions */}
            {sub && (
              <div className="rounded-xl border border-gray-200 p-4 dark:border-gray-800">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
                    {t("billing.subscription")}
                  </p>
                  <Badge color={subscriptionStatusColor(sub.status)}>
                    {subscriptionStatusLabel(sub.status, t)}
                  </Badge>
                </div>
                <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
                  <div>
                    <dt className="text-xs text-gray-400">{t("billing.plan")}</dt>
                    <dd className="text-gray-800 dark:text-white/90">
                      {t("billing.monthPrice", { amount: formatCurrency(sub.monthly_amount, sub.currency) })}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-gray-400">{t("superAdminClinics.period")}</dt>
                    <dd className="text-gray-800 dark:text-white/90">
                      {sub.period_start && sub.period_end
                        ? `${formatDate(sub.period_start)} – ${formatDate(sub.period_end)}`
                        : "—"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-gray-400">{t("billing.daysRemaining")}</dt>
                    <dd className="text-gray-800 dark:text-white/90">{sub.days_remaining}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-gray-400">{t("billing.blocked")}</dt>
                    <dd className="text-gray-800 dark:text-white/90">
                      {sub.blocked ? `${t("common.yes")} — ${sub.blocked_reason ?? ""}` : t("common.no")}
                    </dd>
                  </div>
                </dl>
                <div className="mt-4 flex flex-wrap gap-2">
                  {sub.status !== "ACTIVE" && sub.status !== "TRIAL" && (
                    <button
                      onClick={handleActivate}
                      disabled={actionBusy}
                      className="h-9 rounded-lg bg-success-500 px-3 text-sm font-medium text-white hover:bg-success-600 disabled:opacity-60"
                    >
                      {t("superAdminClinics.activate")}
                    </button>
                  )}
                  <button
                    onClick={() => setDeactivateOpen(true)}
                    disabled={actionBusy || sub.status === "INACTIVE"}
                    className="h-9 rounded-lg bg-error-500 px-3 text-sm font-medium text-white hover:bg-error-600 disabled:opacity-60"
                  >
                    {t("superAdminClinics.deactivate")}
                  </button>
                  <button
                    onClick={() => setExtendOpen(true)}
                    disabled={actionBusy}
                    className="h-9 rounded-lg border border-brand-500/40 px-3 text-sm font-medium text-brand-500 hover:bg-brand-50 disabled:opacity-60 dark:hover:bg-brand-500/10"
                  >
                    {t("superAdminClinics.extendEllipsis")}
                  </button>
                </div>
              </div>
            )}

            {/* Payments */}
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
                {t("superAdminClinics.paymentsCount", { count: payments.length })}
              </p>
              {payments.length === 0 ? (
                <p className="py-3 text-sm text-gray-500 dark:text-gray-400">{t("superAdminClinics.noPayments")}</p>
              ) : (
                <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-800">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableCell isHeader className="px-3 py-2 text-left text-xs font-semibold uppercase text-gray-500">{t("billing.invoiceCol")}</TableCell>
                        <TableCell isHeader className="px-3 py-2 text-left text-xs font-semibold uppercase text-gray-500">{t("billing.amountCol")}</TableCell>
                        <TableCell isHeader className="px-3 py-2 text-left text-xs font-semibold uppercase text-gray-500">{t("dashboard.status")}</TableCell>
                        <TableCell isHeader className="px-3 py-2 text-left text-xs font-semibold uppercase text-gray-500">{t("billing.created")}</TableCell>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {payments.map((p) => (
                        <TableRow key={p.id}>
                          <TableCell className="px-3 py-2 text-sm text-gray-800 dark:text-white/90">{p.invoice_no}</TableCell>
                          <TableCell className="px-3 py-2 text-sm text-gray-800 dark:text-white/90">
                            {formatCurrency(p.amount, p.currency)} · {t("superAdminClinics.monthsAbbrev", { count: p.months })}
                          </TableCell>
                          <TableCell className="px-3 py-2">
                            <Badge size="sm" color={subscriptionPaymentStatusColor(p.status)}>
                              {p.status}
                            </Badge>
                          </TableCell>
                          <TableCell className="px-3 py-2 text-xs text-gray-400">
                            {formatDateTime(p.created_at)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>

            {/* Branches & staff quick facts */}
            <div className="grid gap-4 sm:grid-cols-3">
              <QuickFact label={t("superAdminClinics.branches")} value={detail.branches?.length ?? 0} />
              <QuickFact label={t("superAdminClinics.staffLabel")} value={detail.staff?.length ?? 0} />
              <QuickFact label={t("superAdminClinics.doctorsLabel")} value={detail.doctors?.length ?? 0} />
            </div>
          </div>
        )}
      </Modal>

      {/* Deactivate modal */}
      <Modal isOpen={deactivateOpen} onClose={() => setDeactivateOpen(false)} className="max-w-md p-6">
        <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">{t("superAdminClinics.deactivateClinic")}</h3>
        <p className="mt-1 mb-4 text-sm text-gray-500 dark:text-gray-400">
          {t("superAdminClinics.deactivateDesc")}
        </p>
        <textarea
          value={deactivateReason}
          onChange={(e) => setDeactivateReason(e.target.value)}
          rows={3}
          placeholder={t("superAdminClinics.deactivateReasonPlaceholder")}
          className="w-full rounded-lg border border-gray-300 bg-transparent p-3 text-sm text-gray-800 focus:border-brand-300 focus:outline-hidden dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
        />
        <button
          onClick={handleDeactivate}
          disabled={actionBusy || deactivateReason.trim().length < 3}
          className="mt-4 h-11 w-full rounded-lg bg-error-500 text-sm font-medium text-white hover:bg-error-600 disabled:opacity-60"
        >
          {actionBusy ? t("superAdminClinics.working") : t("superAdminClinics.deactivate")}
        </button>
      </Modal>

      {/* Extend modal */}
      <Modal isOpen={extendOpen} onClose={() => setExtendOpen(false)} className="max-w-md p-6">
        <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">{t("superAdminClinics.extendSubscription")}</h3>
        <p className="mt-1 mb-4 text-sm text-gray-500 dark:text-gray-400">
          {t("superAdminClinics.extendDesc")}
        </p>
        <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-gray-400">
          {t("superAdminClinics.months")}
        </label>
        <input
          type="number"
          min={0}
          max={24}
          value={extendMonths}
          onChange={(e) => setExtendMonths(Number(e.target.value))}
          className="h-11 w-full rounded-lg border border-gray-300 bg-transparent px-3 text-sm text-gray-800 focus:border-brand-300 focus:outline-hidden dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
        />
        <label className="mb-1.5 mt-3 block text-xs font-medium uppercase tracking-wide text-gray-400">
          {t("superAdminClinics.trialDaysHint")}
        </label>
        <input
          type="number"
          min={0}
          max={365}
          value={extendTrialDays}
          onChange={(e) => setExtendTrialDays(Number(e.target.value))}
          className="h-11 w-full rounded-lg border border-gray-300 bg-transparent px-3 text-sm text-gray-800 focus:border-brand-300 focus:outline-hidden dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
        />
        <label className="mb-1.5 mt-3 block text-xs font-medium uppercase tracking-wide text-gray-400">
          {t("superAdminClinics.reason")}
        </label>
        <textarea
          value={extendReason}
          onChange={(e) => setExtendReason(e.target.value)}
          rows={2}
          placeholder={t("superAdminClinics.extendReasonPlaceholder")}
          className="w-full rounded-lg border border-gray-300 bg-transparent p-3 text-sm text-gray-800 focus:border-brand-300 focus:outline-hidden dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
        />
        <button
          onClick={handleExtend}
          disabled={
            actionBusy ||
            extendReason.trim().length < 3 ||
            !(extendMonths > 0) !== !(extendTrialDays > 0)
          }
          className="mt-4 h-11 w-full rounded-lg bg-brand-500 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-60"
        >
          {actionBusy ? t("superAdminClinics.working") : t("superAdminClinics.extend")}
        </button>
      </Modal>
    </div>
  );
}

function QuickFact({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl bg-gray-50 p-3 text-center dark:bg-white/5">
      <p className="text-lg font-bold text-gray-800 dark:text-white/90">{value}</p>
      <p className="text-xs text-gray-400">{label}</p>
    </div>
  );
}
