"use client";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import Badge from "@/components/ui/badge/Badge";
import {
  Modal,
} from "@/components/ui/modal";
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useAuth } from "@/context/AuthContext";
import {
  ApiError,
  Clinic,
  SubscriptionDetailResponse,
  SubscriptionHistoryEntry,
  SubscriptionPayment,
  SubscriptionPaymentStatus,
  clinicsApi,
  subscriptionsApi,
} from "@/lib/api";
import {
  formatCurrency,
  formatDate,
  formatDateTime,
  subscriptionPaymentStatusColor,
  subscriptionStatusColor,
  subscriptionStatusLabel,
} from "@/lib/utils";
import TruckLoader from "@/components/common/TruckLoader";
import { openRazorpayCheckout } from "@/lib/razorpayCheckout";

const PAYMENT_METHODS = [
  { value: "upi", label: "UPI" },
  { value: "card", label: "Card" },
  { value: "netbanking", label: "Net banking" },
  { value: "wallet", label: "Wallet" },
] as const;

export default function BillingPanel() {
  const { user } = useAuth();
  const isOwner = user?.role === "clinic_owner" || user?.role === "sys_admin";

  const [clinics, setClinics] = useState<Clinic[]>([]);
  const [clinicId, setClinicId] = useState("");
  const [detail, setDetail] = useState<SubscriptionDetailResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // payments
  const [payments, setPayments] = useState<SubscriptionPayment[]>([]);
  const [paymentsCursor, setPaymentsCursor] = useState<string | undefined>();
  const [paymentsStatus, setPaymentsStatus] = useState("");
  const [paymentsLoading, setPaymentsLoading] = useState(false);

  // history
  const [history, setHistory] = useState<SubscriptionHistoryEntry[]>([]);
  const [historyCursor, setHistoryCursor] = useState<string | undefined>();
  const [historyLoading, setHistoryLoading] = useState(false);

  // pay modal
  const [payOpen, setPayOpen] = useState(false);
  const [months, setMonths] = useState(1);
  const [method, setMethod] = useState<string>("upi");
  const [initiating, setInitiating] = useState(false);
  const [pendingPayment, setPendingPayment] = useState<SubscriptionPayment | null>(null);
  const [checkoutStage, setCheckoutStage] = useState<"idle" | "opening" | "verifying" | "error">("idle");
  const [checkoutError, setCheckoutError] = useState<string | null>(null);

  const [reactivating, setReactivating] = useState(false);

  useEffect(() => {
    if (!isOwner) return;
    clinicsApi
      .list({ limit: 100 })
      .then((res) => {
        setClinics(res.items);
        setClinicId((prev) => prev || res.items[0]?.id || "");
      })
      .catch((err) => {
        setError(err instanceof ApiError ? err.message : "Failed to load clinics");
      });
  }, [isOwner]);

  const loadPayments = useCallback(
    async (cursor?: string, append = false) => {
      if (!clinicId) return;
      setPaymentsLoading(true);
      try {
        const res = await subscriptionsApi.payments(clinicId, {
          status: (paymentsStatus || undefined) as SubscriptionPaymentStatus | undefined,
          limit: cursor ? undefined : 10,
          cursor,
        });
        setPayments((prev) => (append ? [...prev, ...res.items] : res.items));
        setPaymentsCursor(res.next_cursor ?? undefined);
      } catch (err) {
        if (!append) setPayments([]);
        toast.error(err instanceof ApiError ? err.message : "Failed to load payments");
      } finally {
        setPaymentsLoading(false);
      }
    },
    [clinicId, paymentsStatus]
  );

  const loadHistory = useCallback(async (cursor?: string, append = false) => {
    if (!clinicId) return;
    setHistoryLoading(true);
    try {
      const res = await subscriptionsApi.history(clinicId, {
        limit: cursor ? undefined : 10,
        cursor,
      });
      setHistory((prev) => (append ? [...prev, ...res.items] : res.items));
      setHistoryCursor(res.next_cursor ?? undefined);
    } catch (err) {
      if (!append) setHistory([]);
      toast.error(err instanceof ApiError ? err.message : "Failed to load history");
    } finally {
      setHistoryLoading(false);
    }
  }, [clinicId]);

  useEffect(() => {
    if (!clinicId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    subscriptionsApi
      .get(clinicId)
      .then((res) => {
        if (cancelled) return;
        setDetail(res);
        setPendingPayment(null);
        setCheckoutStage("idle");
        setCheckoutError(null);
      })
      .catch((err) => {
        if (cancelled) return;
        setDetail(null);
        setError(err instanceof ApiError ? err.message : "Failed to load subscription");
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [clinicId]);

  useEffect(() => {
    loadPayments();
  }, [loadPayments]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  const subscription = detail?.subscription;
  const plan = detail?.current_plan;
  const canRenew = useMemo(() => {
    if (!subscription) return false;
    return ["TRIAL", "ACTIVE", "EXPIRING", "EXPIRED"].includes(subscription.status);
  }, [subscription]);
  const isInactive = subscription?.status === "INACTIVE";

  // Razorpay order creation and signature verification both happen server-side
  // on the backend (see subscriptionsApi.initiatePayment/verifyPayment) - this
  // panel only opens Checkout against the order the backend already created
  // and hands the resulting payment id/signature back to the backend to verify.
  const launchCheckout = useCallback(
    async (payment: SubscriptionPayment) => {
      setCheckoutError(null);
      setCheckoutStage("opening");
      try {
        const result = await openRazorpayCheckout({
          orderId: payment.provider_order_id,
          amountPaise: Math.round(payment.amount * 100),
          currency: payment.currency,
          name: "Medinexa",
          description: `Subscription renewal - ${payment.months} month${payment.months > 1 ? "s" : ""}`,
          prefill: user
            ? { name: user.name, email: user.email, contact: user.phone ?? undefined }
            : undefined,
        });

        setCheckoutStage("verifying");
        const res = await subscriptionsApi.verifyPayment(clinicId, payment.id, {
          provider_payment_id: result.razorpay_payment_id,
          provider_signature: result.razorpay_signature,
          reference_no: null,
        });
        toast.success(res.message || "Payment verified.");
        setPayOpen(false);
        setPendingPayment(null);
        setCheckoutStage("idle");
        // Refresh everything - verification can extend/activate the subscription.
        const fresh = await subscriptionsApi.get(clinicId);
        setDetail(fresh);
        loadPayments();
        loadHistory();
      } catch (err) {
        if (err instanceof Error && err.message === "cancelled") {
          setCheckoutStage("idle");
          toast.error("Payment cancelled.");
          return;
        }
        const message =
          err instanceof ApiError
            ? err.message
            : err instanceof Error
              ? err.message
              : "Payment verification failed";
        setCheckoutStage("error");
        setCheckoutError(message);
        toast.error(message);
      }
    },
    [clinicId, loadPayments, loadHistory, user]
  );

  const handleInitiate = async () => {
    if (!clinicId) return;
    setInitiating(true);
    try {
      const res = await subscriptionsApi.initiatePayment(clinicId, {
        months,
        method: method as never,
      });
      setPendingPayment(res.payment);
      setMonths(1);
      loadPayments();
      await launchCheckout(res.payment);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to initiate payment");
    } finally {
      setInitiating(false);
    }
  };

  const handleReactivate = async () => {
    if (!clinicId) return;
    setReactivating(true);
    try {
      const res = await subscriptionsApi.reactivate(clinicId);
      toast.success(res.message || "Clinic reactivated.");
      const fresh = await subscriptionsApi.get(clinicId);
      setDetail(fresh);
      loadPayments();
      loadHistory();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to reactivate");
    } finally {
      setReactivating(false);
    }
  };

  if (!isOwner) {
    return (
      <div className="rounded-2xl border border-gray-200 bg-white p-6 text-sm text-gray-500 dark:border-gray-800 dark:bg-white/[0.03] dark:text-gray-400">
        Only clinic owners can manage billing and subscriptions.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Clinic selector */}
      <div className="flex flex-col gap-3 rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03] sm:flex-row sm:items-center sm:justify-between sm:p-6">
        <div className="w-full sm:w-72">
          <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-gray-400 dark:text-gray-500">
            Clinic
          </label>
          <select
            value={clinicId}
            onChange={(e) => setClinicId(e.target.value)}
            className="h-11 w-full rounded-lg border border-gray-300 bg-transparent px-3 text-sm text-gray-800 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
          >
            <option value="">Select clinic</option>
            {clinics.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2 sm:pb-0">
          {canRenew && (
            <button
              onClick={() => {
                setPendingPayment(null);
                setPayOpen(true);
              }}
              className="inline-flex h-10 items-center rounded-lg bg-brand-500 px-4 text-sm font-medium text-white transition-colors hover:bg-brand-600 disabled:opacity-60"
            >
              Pay / Renew
            </button>
          )}
          {isInactive && (
            <button
              onClick={handleReactivate}
              disabled={reactivating}
              className="inline-flex h-10 items-center rounded-lg bg-success-500 px-4 text-sm font-medium text-white transition-colors hover:bg-success-600 disabled:opacity-60"
            >
              {reactivating ? "Reactivating…" : "Reactivate"}
            </button>
          )}
        </div>
      </div>

      {/* Status card */}
      {loading && (
        <div className="flex justify-center py-16">
          <TruckLoader />
        </div>
      )}
      {!loading && error && (
        <div className="rounded-2xl border border-error-200 bg-error-50 p-6 text-sm text-error-700 dark:border-error-500/20 dark:bg-error-500/10 dark:text-error-400">
          {error}
        </div>
      )}
      {!loading && !error && subscription && (
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] lg:col-span-2">
            <div className="flex flex-wrap items-center gap-3">
              <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">
                Subscription status
              </h3>
              <Badge color={subscriptionStatusColor(subscription.status)}>
                {subscriptionStatusLabel(subscription.status)}
              </Badge>
              {subscription.blocked && (
                <Badge color="error">Blocked</Badge>
              )}
            </div>

            <dl className="mt-4 grid gap-x-8 gap-y-3 sm:grid-cols-2">
              <div>
                <dt className="text-xs uppercase tracking-wide text-gray-400 dark:text-gray-500">
                  Plan
                </dt>
                <dd className="mt-0.5 text-sm text-gray-800 dark:text-white/90">
                  {plan?.name || "—"} ·{" "}
                  {plan ? `${formatCurrency(plan.monthly_amount, plan.currency)} / month` : ""}
                  {plan?.trial_months ? ` (${plan.trial_months}-month free trial)` : ""}
                </dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-gray-400 dark:text-gray-500">
                  Days remaining
                </dt>
                <dd className="mt-0.5 text-sm text-gray-800 dark:text-white/90">
                  {subscription.days_remaining ?? 0}
                  {subscription.expiring_soon && (
                    <span className="ml-2 text-warning-600 dark:text-orange-400">
                      expiring soon
                    </span>
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-gray-400 dark:text-gray-500">
                  Current period
                </dt>
                <dd className="mt-0.5 text-sm text-gray-800 dark:text-white/90">
                  {subscription.period_start && subscription.period_end
                    ? `${formatDate(subscription.period_start)} – ${formatDate(subscription.period_end)}`
                    : "—"}
                </dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-gray-400 dark:text-gray-500">
                  Trial window
                </dt>
                <dd className="mt-0.5 text-sm text-gray-800 dark:text-white/90">
                  {subscription.trial_started_at && subscription.trial_ends_at
                    ? `${formatDate(subscription.trial_started_at)} – ${formatDate(subscription.trial_ends_at)}`
                    : "—"}
                </dd>
              </div>
              {subscription.deactivation_reason && (
                <div className="sm:col-span-2">
                  <dt className="text-xs uppercase tracking-wide text-gray-400 dark:text-gray-500">
                    Deactivation reason
                  </dt>
                  <dd className="mt-0.5 text-sm text-gray-800 dark:text-white/90">
                    {subscription.deactivation_reason}
                  </dd>
                </div>
              )}
              {subscription.blocked_reason && (
                <div className="sm:col-span-2">
                  <dt className="text-xs uppercase tracking-wide text-gray-400 dark:text-gray-500">
                    Blocked reason
                  </dt>
                  <dd className="mt-0.5 text-sm text-gray-800 dark:text-white/90">
                    {subscription.blocked_reason}
                  </dd>
                </div>
              )}
            </dl>
          </div>

          <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
            <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">
              What you get
            </h3>
            <ul className="mt-3 space-y-2 text-sm text-gray-600 dark:text-gray-400">
              <li>Unlimited doctor appointments across branches</li>
              <li>Lab test bookings &amp; scheduling</li>
              <li>Prescriptions with AI scan assist</li>
              <li>Staff permissions &amp; role management</li>
              <li>Payment ledger &amp; reports</li>
            </ul>
            {plan && (
              <p className="mt-4 rounded-xl bg-brand-50 p-3 text-xs text-brand-700 dark:bg-brand-500/10 dark:text-brand-300">
                {formatCurrency(plan.monthly_amount, plan.currency)} per month · pay for up to{" "}
                {detail?.settings.max_months_per_payment ?? 12} months at once.
              </p>
            )}
          </div>
        </div>
      )}

      {/* Payments */}
      <div className="rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]">
        <div className="flex flex-wrap items-center justify-between gap-3 p-4 sm:p-6">
          <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">
            Payment history
          </h3>
          <select
            value={paymentsStatus}
            onChange={(e) => {
              setPaymentsStatus(e.target.value);
            }}
            className="h-9 w-40 rounded-lg border border-gray-300 bg-transparent px-3 text-sm text-gray-800 focus:border-brand-300 focus:outline-hidden dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
          >
            <option value="">All statuses</option>
            <option value="PENDING">Pending</option>
            <option value="PAID">Paid</option>
            <option value="FAILED">Failed</option>
          </select>
        </div>
        <div className="overflow-hidden px-4 pb-4 sm:px-6 sm:pb-6">
          {payments.length === 0 && !paymentsLoading ? (
            <p className="py-6 text-center text-sm text-gray-500 dark:text-gray-400">
              No payments yet.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableCell isHeader className="px-4 py-3 text-left text-xs font-semibold uppercase text-gray-500 dark:text-gray-400">
                      Invoice
                    </TableCell>
                    <TableCell isHeader className="px-4 py-3 text-left text-xs font-semibold uppercase text-gray-500 dark:text-gray-400">
                      Amount
                    </TableCell>
                    <TableCell isHeader className="px-4 py-3 text-left text-xs font-semibold uppercase text-gray-500 dark:text-gray-400">
                      Months
                    </TableCell>
                    <TableCell isHeader className="px-4 py-3 text-left text-xs font-semibold uppercase text-gray-500 dark:text-gray-400">
                      Method
                    </TableCell>
                    <TableCell isHeader className="px-4 py-3 text-left text-xs font-semibold uppercase text-gray-500 dark:text-gray-400">
                      Status
                    </TableCell>
                    <TableCell isHeader className="px-4 py-3 text-left text-xs font-semibold uppercase text-gray-500 dark:text-gray-400">
                      Created
                    </TableCell>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {payments.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="px-4 py-3 text-sm text-gray-800 dark:text-white/90">
                        {p.invoice_no}
                        {p.provider_order_id && (
                          <span className="block text-xs text-gray-400">{p.provider_order_id}</span>
                        )}
                      </TableCell>
                      <TableCell className="px-4 py-3 text-sm text-gray-800 dark:text-white/90">
                        {formatCurrency(p.amount, p.currency)}
                      </TableCell>
                      <TableCell className="px-4 py-3 text-sm text-gray-800 dark:text-white/90">
                        {p.months}
                      </TableCell>
                      <TableCell className="px-4 py-3 text-sm capitalize text-gray-800 dark:text-white/90">
                        {p.method}
                      </TableCell>
                      <TableCell className="px-4 py-3">
                        <Badge color={subscriptionPaymentStatusColor(p.status)}>{p.status}</Badge>
                        {p.failure_reason && (
                          <span className="block text-xs text-error-500">{p.failure_reason}</span>
                        )}
                      </TableCell>
                      <TableCell className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
                        {formatDateTime(p.created_at)}
                        {p.period_end && (
                          <span className="block text-xs">covers till {formatDate(p.period_end)}</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
          {paymentsCursor && (
            <div className="mt-3 text-center">
              <button
                onClick={() => loadPayments(paymentsCursor, true)}
                disabled={paymentsLoading}
                className="text-sm font-medium text-brand-500 hover:underline disabled:opacity-60"
              >
                {paymentsLoading ? "Loading…" : "Load more"}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* History */}
      <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03] sm:p-6">
        <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">
          Subscription activity
        </h3>
        {history.length === 0 && !historyLoading ? (
          <p className="py-6 text-center text-sm text-gray-500 dark:text-gray-400">
            No activity yet.
          </p>
        ) : (
          <ol className="mt-4 space-y-3 border-l border-gray-200 pl-4 dark:border-gray-800">
            {history.map((h) => (
              <li key={h.id} className="relative text-sm">
                <span className="absolute -left-[21px] top-1.5 h-2 w-2 rounded-full bg-brand-500" />
                <p className="font-medium text-gray-800 dark:text-white/90">
                  {h.from_status ? `${h.from_status} → ` : ""}
                  {h.to_status}
                  {h.reason ? ` — ${h.reason}` : ""}
                </p>
                <p className="text-xs text-gray-400">
                  {formatDateTime(h.created_at)} · via {h.source.replaceAll("_", " ")}
                </p>
              </li>
            ))}
          </ol>
        )}
        {historyCursor && (
          <div className="mt-3 text-center">
            <button
              onClick={() => loadHistory(historyCursor, true)}
              disabled={historyLoading}
              className="text-sm font-medium text-brand-500 hover:underline disabled:opacity-60"
            >
              {historyLoading ? "Loading…" : "Load more"}
            </button>
          </div>
        )}
      </div>

      {/* Pay modal */}
      <Modal isOpen={payOpen} onClose={() => setPayOpen(false)} className="max-w-lg p-6 m-4">
        <h3 className="mb-1 text-lg font-semibold text-gray-800 dark:text-white/90">
          {pendingPayment ? "Complete payment" : "Initiate payment"}
        </h3>
        <p className="mb-4 text-sm text-gray-500 dark:text-gray-400">
          {pendingPayment
            ? "Complete the payment in the Razorpay window to activate your subscription."
            : `Paying extends the subscription by full months starting ${formatDate(
                subscription?.period_end || new Date().toISOString()
              )}.`}
        </p>

        {!pendingPayment ? (
          <div className="space-y-4">
            <div>
              <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-gray-400 dark:text-gray-500">
                Months
              </label>
              <select
                value={months}
                onChange={(e) => setMonths(Number(e.target.value))}
                className="h-11 w-full rounded-lg border border-gray-300 bg-transparent px-3 text-sm text-gray-800 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
              >
                {Array.from({ length: detail?.settings.max_months_per_payment || 12 }, (_, i) => i + 1).map((m) => (
                  <option key={m} value={m}>
                    {m} month{m > 1 ? "s" : ""} —{" "}
                    {plan ? formatCurrency(plan.monthly_amount * m, plan.currency) : ""}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-gray-400 dark:text-gray-500">
                Method
              </label>
              <select
                value={method}
                onChange={(e) => setMethod(e.target.value)}
                className="h-11 w-full rounded-lg border border-gray-300 bg-transparent px-3 text-sm text-gray-800 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
              >
                {PAYMENT_METHODS.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
            </div>
            <button
              onClick={handleInitiate}
              disabled={initiating}
              className="h-11 w-full rounded-lg bg-brand-500 text-sm font-medium text-white transition-colors hover:bg-brand-600 disabled:opacity-60"
            >
              {initiating ? "Initiating…" : "Create order"}
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="rounded-xl bg-gray-50 p-3 text-sm dark:bg-white/5">
              <p className="font-medium text-gray-800 dark:text-white/90">
                Order {pendingPayment.provider_order_id}
              </p>
              <p className="text-gray-500 dark:text-gray-400">
                {formatCurrency(pendingPayment.amount, pendingPayment.currency)} for{" "}
                {pendingPayment.months} month{pendingPayment.months > 1 ? "s" : ""}
              </p>
            </div>

            {checkoutStage === "error" ? (
              <p className="rounded-xl border border-error-200 bg-error-50 p-3 text-sm text-error-700 dark:border-error-500/20 dark:bg-error-500/10 dark:text-error-400">
                {checkoutError}
              </p>
            ) : (
              <p className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-gray-300 border-t-brand-500 dark:border-gray-700" />
                {checkoutStage === "verifying" ? "Verifying payment…" : "Waiting for the Razorpay window…"}
              </p>
            )}

            <button
              onClick={() => launchCheckout(pendingPayment)}
              disabled={checkoutStage === "opening" || checkoutStage === "verifying"}
              className="h-11 w-full rounded-lg bg-brand-500 text-sm font-medium text-white transition-colors hover:bg-brand-600 disabled:opacity-60"
            >
              {checkoutStage === "error" ? "Retry payment" : "Reopen payment window"}
            </button>
          </div>
        )}
      </Modal>
    </div>
  );
}
