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
  OfferChannelPlan,
  OfferDeliveryStatus,
  SuperAdminOffer,
  SuperAdminOfferChannels,
  SuperAdminOfferDetailResponse,
  SuperAdminOfferPreviewResponse,
  SuperAdminClinicListItem,
  superAdminApi,
} from "@/lib/api";
import { formatCurrency, formatDateISO, formatDateTime } from "@/lib/utils";
import { useTranslation } from "@/hooks/useTranslation";
import { Skeleton, TableRowsSkeleton } from "@/components/ui/skeleton/Skeleton";
import { useAsyncAction, useKeyedAction, useLatestRequest } from "@/hooks/useAsyncAction";

const DEFAULT_CHANNELS: SuperAdminOfferChannels = {
  sms: true,
  whatsapp: true,
  email: true,
  portal: true,
};

function defaultValidUntil(): string {
  const d = new Date();
  d.setDate(d.getDate() + 30);
  return formatDateISO(d);
}

export default function SuperAdminOffersPanel() {
  const { t } = useTranslation();

  // ── clinic picker ──────────────────────────────────────────────────
  const [clinicQuery, setClinicQuery] = useState("");
  const [clinicResults, setClinicResults] = useState<SuperAdminClinicListItem[]>([]);
  const [clinicSearchLoading, setClinicSearchLoading] = useState(false);
  const [selected, setSelected] = useState<Map<string, string>>(new Map());

  useEffect(() => {
    if (!clinicQuery.trim()) {
      setClinicResults([]);
      // A search cancelled by clearing the box must not leave the loader on.
      setClinicSearchLoading(false);
      return;
    }
    let active = true;
    setClinicSearchLoading(true);
    const timer = setTimeout(() => {
      superAdminApi
        .clinics({ q: clinicQuery.trim(), limit: 8 })
        .then((res) => {
          if (active) setClinicResults(res.items);
        })
        .catch(() => {})
        .finally(() => {
          if (active) setClinicSearchLoading(false);
        });
    }, 300);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [clinicQuery]);

  const toggleClinic = (clinic: SuperAdminClinicListItem) => {
    setSelected((prev) => {
      const next = new Map(prev);
      if (next.has(clinic.id)) next.delete(clinic.id);
      else next.set(clinic.id, clinic.name);
      return next;
    });
  };

  // ── offer form ──────────────────────────────────────────────────────
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState(() => t("superAdminOffers.messagePlaceholder"));
  const [discountedAmount, setDiscountedAmount] = useState("");
  const [currency, setCurrency] = useState("INR");
  const [durationMonths, setDurationMonths] = useState("3");
  const [validUntil, setValidUntil] = useState(defaultValidUntil());
  const [channels, setChannels] = useState<SuperAdminOfferChannels>(DEFAULT_CHANNELS);

  const buildInput = () => ({
    clinic_ids: Array.from(selected.keys()),
    title: title.trim(),
    message: message.trim(),
    discounted_amount: Number(discountedAmount),
    currency: currency || undefined,
    duration_months: Number(durationMonths),
    valid_until: new Date(`${validUntil}T23:59:59`).toISOString(),
    channels,
  });

  const formReady =
    selected.size > 0 &&
    title.trim().length > 0 &&
    message.trim().length > 0 &&
    Number(discountedAmount) > 0 &&
    Number(durationMonths) > 0 &&
    !!validUntil;

  // ── preview / send ──────────────────────────────────────────────────
  const { pending: previewing, run: runPreviewAction } = useAsyncAction();
  const [preview, setPreview] = useState<SuperAdminOfferPreviewResponse | null>(null);
  const { pending: sending, run: runSendAction } = useAsyncAction();

  const runPreview = async () => {
    if (!formReady) {
      toast.error(t("superAdminOffers.selectAtLeastOneClinic"));
      return;
    }
    await runPreviewAction(async () => {
      setPreview(null);
      try {
        const res = await superAdminApi.previewOffer(buildInput());
        setPreview(res);
      } catch (err) {
        toast.error(err instanceof ApiError ? err.message : t("superAdminOffers.failedToPreviewOffer"));
      }
    });
  };

  const runSend = async () => {
    if (!formReady) {
      toast.error(t("superAdminOffers.selectAtLeastOneClinic"));
      return;
    }
    await runSendAction(async () => {
      try {
        const res = await superAdminApi.createOffer(buildInput());
        toast.success(res.message || t("superAdminOffers.offerSent"));
        setSelected(new Map());
        setTitle("");
        setMessage(t("superAdminOffers.messagePlaceholder"));
        setDiscountedAmount("");
        setDurationMonths("3");
        setValidUntil(defaultValidUntil());
        setChannels(DEFAULT_CHANNELS);
        setPreview(null);
        // The new offer's server-assigned fields (id, counts) are needed, so
        // refresh the list - silently, keeping the existing rows on screen.
        loadOffers(undefined, false, { silent: true });
      } catch (err) {
        // Form fields are kept so the user can correct and retry.
        toast.error(err instanceof ApiError ? err.message : t("superAdminOffers.failedToSendOffer"));
      }
    });
  };

  // ── past offers list ─────────────────────────────────────────────────
  const [offers, setOffers] = useState<SuperAdminOffer[]>([]);
  const [offersCursor, setOffersCursor] = useState<string | undefined>();
  const [offersLoading, setOffersLoading] = useState(true);
  const [offersLoadingMore, setOffersLoadingMore] = useState(false);
  const [offersError, setOffersError] = useState<string | null>(null);
  const { begin: beginOffers, isLatest: isLatestOffers } = useLatestRequest();

  // `silent` refreshes after a mutation without flashing the table skeleton.
  const loadOffers = useCallback(
    async (nextCursor?: string, append = false, opts?: { silent?: boolean }) => {
      const token = beginOffers();
      if (append) setOffersLoadingMore(true);
      else {
        setOffersLoadingMore(false);
        if (!opts?.silent) setOffersLoading(true);
      }
      setOffersError(null);
      try {
        const res = await superAdminApi.offers({ limit: nextCursor ? undefined : 20, cursor: nextCursor });
        if (!isLatestOffers(token)) return;
        setOffers((prev) => (append ? [...prev, ...res.items] : res.items));
        setOffersCursor(res.next_cursor ?? undefined);
      } catch (err) {
        if (!isLatestOffers(token)) return;
        if (!append && !opts?.silent) setOffers([]);
        setOffersError(err instanceof ApiError ? err.message : t("superAdminOffers.failedToLoadOffers"));
      } finally {
        if (isLatestOffers(token)) {
          setOffersLoading(false);
          setOffersLoadingMore(false);
        }
      }
    },
    [t, beginOffers, isLatestOffers]
  );

  useEffect(() => {
    loadOffers();
  }, [loadOffers]);

  // ── detail modal ──────────────────────────────────────────────────────
  const [detail, setDetail] = useState<SuperAdminOfferDetailResponse | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const { begin: beginDetail, isLatest: isLatestDetail } = useLatestRequest();

  const openDetail = async (offerId: string) => {
    const token = beginDetail();
    setDetailLoading(true);
    try {
      const res = await superAdminApi.offer(offerId);
      if (!isLatestDetail(token)) return;
      setDetail(res);
    } catch (err) {
      if (!isLatestDetail(token)) return;
      toast.error(err instanceof ApiError ? err.message : t("superAdminOffers.failedToLoadOffers"));
    } finally {
      if (isLatestDetail(token)) setDetailLoading(false);
    }
  };

  // ── cancel ──────────────────────────────────────────────────────────
  const [cancelTarget, setCancelTarget] = useState<SuperAdminOffer | null>(null);
  // Keyed per offer, so a cancel in flight only locks that offer's buttons.
  const { run: runOfferAction, isPending: isOfferPending } = useKeyedAction<string>();
  const cancelling = cancelTarget ? isOfferPending(cancelTarget.id) : false;

  const runCancel = async () => {
    if (!cancelTarget) return;
    const target = cancelTarget;
    await runOfferAction(target.id, async () => {
      try {
        const res = await superAdminApi.cancelOffer(target.id);
        toast.success(res.message || t("superAdminOffers.offerCancelled"));
        setCancelTarget(null);
        if (detail?.offer.id === target.id) setDetail({ ...detail, offer: res.offer });
        // Targeted update - patch just this row from the response; keep the
        // list counts if the response omits them.
        setOffers((prev) =>
          prev.map((o) =>
            o.id === target.id
              ? {
                  ...o,
                  ...res.offer,
                  recipient_count: res.offer.recipient_count ?? o.recipient_count,
                  redeemed_count: res.offer.redeemed_count ?? o.redeemed_count,
                }
              : o
          )
        );
      } catch (err) {
        toast.error(err instanceof ApiError ? err.message : t("superAdminOffers.failedToCancelOffer"));
      }
    });
  };

  const channelPlanColor = (plan: OfferChannelPlan): "success" | "light" | "warning" =>
    plan === "will_send" ? "success" : plan === "disabled" ? "light" : "warning";
  const channelPlanLabel = (plan: OfferChannelPlan): string =>
    plan === "will_send"
      ? t("superAdminOffers.willSend")
      : plan === "skipped_no_phone"
        ? t("superAdminOffers.skippedNoPhone")
        : plan === "skipped_no_email"
          ? t("superAdminOffers.skippedNoEmail")
          : t("superAdminOffers.disabled");

  const deliveryColor = (status: OfferDeliveryStatus | null): "success" | "light" | "error" =>
    status === "SENT" ? "success" : status === "FAILED" ? "error" : "light";

  return (
    <div className="space-y-4">
      {/* Step 1 — select clinics */}
      <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03] sm:p-6">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
          {t("superAdminOffers.selectClinics")}
        </h3>
        <input
          value={clinicQuery}
          onChange={(e) => setClinicQuery(e.target.value)}
          placeholder={t("superAdminOffers.searchClinicsPlaceholder")}
          className="mt-3 h-11 w-full rounded-lg border border-gray-300 bg-transparent px-3 text-sm text-gray-800 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
        />
        {clinicSearchLoading ? (
          // New query in flight: don't let the previous results pose as current.
          <div
            role="status"
            aria-busy="true"
            className="mt-2 divide-y divide-gray-100 rounded-lg border border-gray-200 dark:divide-gray-800 dark:border-gray-800"
          >
            <span className="sr-only">{t("common.loading")}</span>
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex items-center justify-between gap-3 px-3 py-2.5">
                <div className="flex flex-1 items-center gap-2">
                  <Skeleton className="h-3.5 w-1/3" />
                  <Skeleton className="h-3 w-1/4" />
                </div>
                <Skeleton className="h-3 w-3" />
              </div>
            ))}
          </div>
        ) : clinicResults.length > 0 && (
          <div className="mt-2 max-h-56 overflow-y-auto rounded-lg border border-gray-200 dark:border-gray-800">
            {clinicResults.map((c) => (
              <button
                type="button"
                key={c.id}
                onClick={() => toggleClinic(c)}
                className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-gray-50 dark:hover:bg-white/[0.03] ${
                  selected.has(c.id) ? "bg-brand-50 dark:bg-brand-500/10" : ""
                }`}
              >
                <span>
                  <span className="font-medium text-gray-800 dark:text-white/90">{c.name}</span>
                  <span className="ml-2 text-xs text-gray-400">{c.owner?.email}</span>
                </span>
                <span className="text-xs font-medium text-brand-500">
                  {selected.has(c.id) ? "✓" : "+"}
                </span>
              </button>
            ))}
          </div>
        )}
        {selected.size > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="text-xs text-gray-500 dark:text-gray-400">
              {t("superAdminOffers.selectedClinicsCount", { count: selected.size })}
            </span>
            {Array.from(selected.entries()).map(([id, name]) => (
              <span
                key={id}
                className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-3 py-1 text-xs text-gray-700 dark:bg-white/10 dark:text-gray-200"
              >
                {name}
                <button
                  type="button"
                  onClick={() =>
                    setSelected((prev) => {
                      const next = new Map(prev);
                      next.delete(id);
                      return next;
                    })
                  }
                  className="text-gray-400 hover:text-error-500"
                >
                  ×
                </button>
              </span>
            ))}
            <button
              type="button"
              onClick={() => setSelected(new Map())}
              className="text-xs font-medium text-error-500 hover:underline"
            >
              {t("superAdminOffers.clearSelection")}
            </button>
          </div>
        )}
      </div>

      {/* Step 2 — offer details */}
      <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03] sm:p-6">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
          {t("superAdminOffers.offerDetails")}
        </h3>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-gray-400">
              {t("superAdminOffers.campaignTitle")}
            </label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t("superAdminOffers.campaignTitlePlaceholder")}
              className="h-11 w-full rounded-lg border border-gray-300 bg-transparent px-3 text-sm text-gray-800 focus:border-brand-300 focus:outline-hidden dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
            />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-gray-400">
                {t("superAdminOffers.discountedAmount")}
              </label>
              <input
                type="number"
                min={0}
                value={discountedAmount}
                onChange={(e) => setDiscountedAmount(e.target.value)}
                className="h-11 w-full rounded-lg border border-gray-300 bg-transparent px-3 text-sm text-gray-800 focus:border-brand-300 focus:outline-hidden dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-gray-400">
                {t("superAdminOffers.currency")}
              </label>
              <input
                value={currency}
                onChange={(e) => setCurrency(e.target.value.toUpperCase())}
                className="h-11 w-full rounded-lg border border-gray-300 bg-transparent px-3 text-sm text-gray-800 focus:border-brand-300 focus:outline-hidden dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-gray-400">
                {t("superAdminOffers.durationMonths")}
              </label>
              <input
                type="number"
                min={1}
                max={24}
                value={durationMonths}
                onChange={(e) => setDurationMonths(e.target.value)}
                className="h-11 w-full rounded-lg border border-gray-300 bg-transparent px-3 text-sm text-gray-800 focus:border-brand-300 focus:outline-hidden dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
              />
            </div>
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-gray-400">
              {t("superAdminOffers.validUntil")}
            </label>
            <input
              type="date"
              value={validUntil}
              onChange={(e) => setValidUntil(e.target.value)}
              className="h-11 w-full rounded-lg border border-gray-300 bg-transparent px-3 text-sm text-gray-800 focus:border-brand-300 focus:outline-hidden dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-gray-400">
              {t("superAdminOffers.message")}
            </label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={3}
              placeholder={t("superAdminOffers.messagePlaceholder")}
              className="w-full rounded-lg border border-gray-300 bg-transparent p-3 text-sm text-gray-800 focus:border-brand-300 focus:outline-hidden dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
            />
            <p className="mt-1 text-xs text-gray-400">{t("superAdminOffers.messageHint")}</p>
          </div>
        </div>

        <h3 className="mt-5 text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
          {t("superAdminOffers.channels")}
        </h3>
        <div className="mt-3 flex flex-wrap gap-4">
          {(["sms", "whatsapp", "email", "portal"] as const).map((ch) => (
            <label key={ch} className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
              <input
                type="checkbox"
                checked={channels[ch]}
                onChange={(e) => setChannels((prev) => ({ ...prev, [ch]: e.target.checked }))}
                className="h-4 w-4 rounded border-gray-300"
              />
              {t(`superAdminOffers.channel${ch.charAt(0).toUpperCase()}${ch.slice(1)}`)}
            </label>
          ))}
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={runPreview}
            disabled={previewing || !formReady}
            className="h-11 rounded-lg border border-brand-500/40 px-5 text-sm font-medium text-brand-500 hover:bg-brand-50 disabled:cursor-not-allowed disabled:opacity-60 dark:hover:bg-brand-500/10"
          >
            {previewing ? t("superAdminOffers.previewing") : t("superAdminOffers.previewButton")}
          </button>
          <button
            type="button"
            onClick={runSend}
            disabled={sending || !formReady}
            className="h-11 rounded-lg bg-brand-500 px-5 text-sm font-medium text-white hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {sending ? t("superAdminOffers.sending") : t("superAdminOffers.sendButton")}
          </button>
        </div>
      </div>

      {/* Preview results */}
      {preview && (
        <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03] sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
              {t("superAdminOffers.previewResults")}
            </h3>
            <p className="text-xs text-gray-400">
              {t("superAdminOffers.currentPlanPrice")}: {formatCurrency(preview.plan_amount, preview.currency)} ·{" "}
              {t("superAdminOffers.savingsPerMonth")}: {formatCurrency(preview.savings_per_month, preview.currency)}
            </p>
          </div>
          <div className="mt-3 space-y-3">
            {preview.recipients.map((r) => (
              <div key={r.clinic_id} className="rounded-xl border border-gray-200 p-3 dark:border-gray-800">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-medium text-gray-800 dark:text-white/90">{r.clinic_name}</p>
                  <div className="flex flex-wrap gap-1.5">
                    <Badge size="sm" color={channelPlanColor(r.channels.sms)}>
                      SMS: {channelPlanLabel(r.channels.sms)}
                    </Badge>
                    <Badge size="sm" color={channelPlanColor(r.channels.whatsapp)}>
                      WhatsApp: {channelPlanLabel(r.channels.whatsapp)}
                    </Badge>
                    <Badge size="sm" color={channelPlanColor(r.channels.email)}>
                      Email: {channelPlanLabel(r.channels.email)}
                    </Badge>
                    <Badge size="sm" color={channelPlanColor(r.channels.portal)}>
                      Portal: {channelPlanLabel(r.channels.portal)}
                    </Badge>
                  </div>
                </div>
                <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                  {t("superAdminOffers.renderedMessage")}: {r.rendered_message}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Past offers */}
      <div className="rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]">
        <h3 className="p-4 text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 sm:p-6 sm:pb-0">
          {t("superAdminOffers.pastOffers")}
        </h3>
        {offersError && (
          <div className="flex flex-wrap items-center gap-3 p-6">
            <p className="text-sm text-error-500">{offersError}</p>
            {offers.length === 0 && (
              <button
                type="button"
                onClick={() => loadOffers()}
                disabled={offersLoading}
                className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-white/[0.03]"
              >
                {t("common.retry")}
              </button>
            )}
          </div>
        )}
        {!offersError && !offersLoading && offers.length === 0 && (
          <p className="py-8 text-center text-sm text-gray-500 dark:text-gray-400">
            {t("superAdminOffers.noOffersYet")}
          </p>
        )}
        {(offersLoading || offers.length > 0) && (
          <div className="overflow-x-auto p-4 sm:p-6">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableCell isHeader className="px-4 py-3 text-left text-xs font-semibold uppercase text-gray-500">{t("superAdminOffers.campaign")}</TableCell>
                  <TableCell isHeader className="px-4 py-3 text-left text-xs font-semibold uppercase text-gray-500">{t("superAdminOffers.price")}</TableCell>
                  <TableCell isHeader className="px-4 py-3 text-left text-xs font-semibold uppercase text-gray-500">{t("superAdminOffers.duration")}</TableCell>
                  <TableCell isHeader className="px-4 py-3 text-left text-xs font-semibold uppercase text-gray-500">{t("superAdminOffers.validUntil")}</TableCell>
                  <TableCell isHeader className="px-4 py-3 text-left text-xs font-semibold uppercase text-gray-500">{t("dashboard.status")}</TableCell>
                  <TableCell isHeader className="px-4 py-3 text-left text-xs font-semibold uppercase text-gray-500">{t("superAdminOffers.recipients")}</TableCell>
                  <TableCell isHeader className="px-4 py-3 text-left text-xs font-semibold uppercase text-gray-500">{t("superAdminOffers.redeemed")}</TableCell>
                  <TableCell isHeader className="px-4 py-3 text-left text-xs font-semibold uppercase text-gray-500">{""}</TableCell>
                </TableRow>
              </TableHeader>
              <TableBody>
                {offersLoading ? (
                  <TableRowsSkeleton rows={5} cols={8} actions cellClassName="px-4 py-3" />
                ) : offers.map((o) => {
                  const offerCancelling = isOfferPending(o.id);
                  return (
                  <TableRow key={o.id}>
                    <TableCell className="px-4 py-3 text-sm font-medium text-gray-800 dark:text-white/90">{o.title}</TableCell>
                    <TableCell className="px-4 py-3 text-sm text-gray-800 dark:text-white/90">
                      {formatCurrency(o.discounted_amount, o.currency)}
                    </TableCell>
                    <TableCell className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">
                      {t("superAdminPlans.monthsAbbrev", { count: o.duration_months })}
                    </TableCell>
                    <TableCell className="px-4 py-3 text-xs text-gray-400">
                      {o.valid_until ? formatDateTime(o.valid_until) : "—"}
                    </TableCell>
                    <TableCell className="px-4 py-3">
                      <Badge size="sm" color={o.status === "ACTIVE" ? "success" : "light"}>
                        {o.status === "ACTIVE" ? t("status.active") : t("status.cancelled")}
                      </Badge>
                    </TableCell>
                    <TableCell className="px-4 py-3 text-sm text-gray-800 dark:text-white/90">{o.recipient_count ?? "—"}</TableCell>
                    <TableCell className="px-4 py-3 text-sm text-gray-800 dark:text-white/90">{o.redeemed_count ?? "—"}</TableCell>
                    <TableCell className="px-4 py-3 text-right text-sm">
                      <button
                        type="button"
                        onClick={() => openDetail(o.id)}
                        className="mr-3 font-medium text-brand-500 hover:underline"
                      >
                        {t("superAdminOffers.view")}
                      </button>
                      {o.status === "ACTIVE" && (
                        <button
                          type="button"
                          onClick={() => setCancelTarget(o)}
                          disabled={offerCancelling}
                          className="font-medium text-error-500 hover:underline disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {offerCancelling ? t("superAdminOffers.cancelling") : t("superAdminOffers.cancelOffer")}
                        </button>
                      )}
                    </TableCell>
                  </TableRow>
                  );
                })}
                {offersLoadingMore && (
                  <TableRowsSkeleton rows={3} cols={8} actions cellClassName="px-4 py-3" />
                )}
              </TableBody>
            </Table>
            {!offersLoading && offersCursor && (
              <div className="mt-3 text-center">
                <button
                  type="button"
                  onClick={() => loadOffers(offersCursor, true)}
                  disabled={offersLoadingMore}
                  className="text-sm font-medium text-brand-500 hover:underline disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {offersLoadingMore ? t("common.loading") : t("superAdminOffers.loadMore")}
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Detail modal */}
      <Modal isOpen={detailLoading || !!detail} onClose={() => setDetail(null)} className="max-w-3xl p-6">
        {detailLoading && (
          <div role="status" aria-busy="true" className="space-y-4">
            <span className="sr-only">{t("common.loading")}</span>
            <div className="flex items-center justify-between gap-2">
              <Skeleton className="h-6 w-1/2" />
              <Skeleton className="h-5 w-16 rounded-full" />
            </div>
            <Skeleton className="h-4 w-5/6" />
            <div className="grid gap-x-6 gap-y-3 sm:grid-cols-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="space-y-1.5">
                  <Skeleton className="h-3 w-16" />
                  <Skeleton className="h-4 w-2/3" />
                </div>
              ))}
            </div>
            <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-800">
              <table className="min-w-full">
                <tbody>
                  <TableRowsSkeleton rows={4} cols={7} cellClassName="px-3 py-2.5" />
                </tbody>
              </table>
            </div>
          </div>
        )}
        {!detailLoading && detail && (
          <div className="max-h-[75vh] space-y-4 overflow-y-auto">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">{detail.offer.title}</h3>
              <Badge color={detail.offer.status === "ACTIVE" ? "success" : "light"}>
                {detail.offer.status === "ACTIVE" ? t("status.active") : t("status.cancelled")}
              </Badge>
            </div>
            <p className="text-sm text-gray-500 dark:text-gray-400">{detail.offer.message}</p>
            <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
              <div>
                <dt className="text-xs text-gray-400">{t("superAdminOffers.price")}</dt>
                <dd className="text-gray-800 dark:text-white/90">
                  {formatCurrency(detail.offer.discounted_amount, detail.offer.currency)}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-gray-400">{t("superAdminOffers.duration")}</dt>
                <dd className="text-gray-800 dark:text-white/90">
                  {t("superAdminPlans.monthsAbbrev", { count: detail.offer.duration_months })}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-gray-400">{t("superAdminOffers.validUntil")}</dt>
                <dd className="text-gray-800 dark:text-white/90">{formatDateTime(detail.offer.valid_until)}</dd>
              </div>
            </dl>

            {detail.offer.status === "ACTIVE" && (
              <button
                type="button"
                onClick={() => setCancelTarget(detail.offer)}
                disabled={isOfferPending(detail.offer.id)}
                className="h-9 rounded-lg bg-error-500 px-3 text-sm font-medium text-white hover:bg-error-600 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isOfferPending(detail.offer.id) ? t("superAdminOffers.cancelling") : t("superAdminOffers.cancelOffer")}
              </button>
            )}

            <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-800">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableCell isHeader className="px-3 py-2 text-left text-xs font-semibold uppercase text-gray-500">{t("superAdminOffers.clinic")}</TableCell>
                    <TableCell isHeader className="px-3 py-2 text-left text-xs font-semibold uppercase text-gray-500">{t("dashboard.status")}</TableCell>
                    <TableCell isHeader className="px-3 py-2 text-left text-xs font-semibold uppercase text-gray-500">{t("superAdminOffers.monthsRemaining")}</TableCell>
                    <TableCell isHeader className="px-3 py-2 text-left text-xs font-semibold uppercase text-gray-500">SMS</TableCell>
                    <TableCell isHeader className="px-3 py-2 text-left text-xs font-semibold uppercase text-gray-500">WhatsApp</TableCell>
                    <TableCell isHeader className="px-3 py-2 text-left text-xs font-semibold uppercase text-gray-500">Email</TableCell>
                    <TableCell isHeader className="px-3 py-2 text-left text-xs font-semibold uppercase text-gray-500">{t("superAdminOffers.notifiedAt")}</TableCell>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {detail.recipients.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="px-3 py-2 text-sm text-gray-800 dark:text-white/90">{r.clinic_name}</TableCell>
                      <TableCell className="px-3 py-2">
                        <Badge size="sm" color={r.status === "REDEEMED" ? "success" : "light"}>
                          {r.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="px-3 py-2 text-sm text-gray-800 dark:text-white/90">{r.months_remaining}</TableCell>
                      <TableCell className="px-3 py-2">
                        <Badge size="sm" color={deliveryColor(r.notify_sms_status)}>{r.notify_sms_status ?? "—"}</Badge>
                      </TableCell>
                      <TableCell className="px-3 py-2">
                        <Badge size="sm" color={deliveryColor(r.notify_whatsapp_status)}>{r.notify_whatsapp_status ?? "—"}</Badge>
                      </TableCell>
                      <TableCell className="px-3 py-2">
                        <Badge size="sm" color={deliveryColor(r.notify_email_status)}>{r.notify_email_status ?? "—"}</Badge>
                      </TableCell>
                      <TableCell className="px-3 py-2 text-xs text-gray-400">
                        {r.notified_at ? formatDateTime(r.notified_at) : "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )}
      </Modal>

      {/* Cancel confirm modal */}
      <Modal isOpen={!!cancelTarget} onClose={() => setCancelTarget(null)} closeDisabled={cancelling} className="max-w-md p-6">
        <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">{t("superAdminOffers.confirmCancelTitle")}</h3>
        <p className="mt-1 mb-4 text-sm text-gray-500 dark:text-gray-400">{t("superAdminOffers.confirmCancelDesc")}</p>
        <button
          type="button"
          onClick={runCancel}
          disabled={cancelling}
          className="h-11 w-full rounded-lg bg-error-500 text-sm font-medium text-white hover:bg-error-600 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {cancelling ? t("superAdminOffers.cancelling") : t("superAdminOffers.cancelOffer")}
        </button>
      </Modal>
    </div>
  );
}
