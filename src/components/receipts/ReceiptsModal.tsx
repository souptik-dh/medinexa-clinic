"use client";
import React, { useEffect, useState } from "react";
import { Modal } from "@/components/ui/modal";
import { ApiError, Receipt, receiptsApi } from "@/lib/api";
import { downloadBlob } from "@/lib/utils";
import { useTranslation } from "@/hooks/useTranslation";
import { useKeyedAction } from "@/hooks/useAsyncAction";
import { Skeleton } from "@/components/ui/skeleton/Skeleton";

export default function ReceiptsModal({
  isOpen,
  onClose,
  kind,
  appointmentId,
}: {
  isOpen: boolean;
  onClose: () => void;
  kind: "appointment" | "lab-test";
  appointmentId: string | null;
}) {
  const { t } = useTranslation();
  const [reloadKey, setReloadKey] = useState(0);
  // Identifies the list that should be on screen; a result stored under any
  // other key (a previously opened appointment, a late response) is stale.
  const requestKey = isOpen && appointmentId ? `${kind}:${appointmentId}:${reloadKey}` : null;
  const [result, setResult] = useState<{
    key: string;
    receipts: Receipt[];
    error: string | null;
  } | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const loading = !!requestKey && result?.key !== requestKey;
  const current = !loading && result?.key === requestKey ? result : null;
  const receipts = current?.receipts ?? [];
  // Only a failed list load offers Retry.
  const loadError = current?.error ?? null;
  const error = loading ? null : downloadError ?? loadError;
  // Per-receipt download state, so one PDF download never blocks another.
  const downloadAction = useKeyedAction<string>();

  const EVENT_LABEL: Record<Receipt["event_type"], string> = {
    booking_confirmed: t("receipts.bookingConfirmed"),
    payment_received: t("receipts.paymentReceived"),
    completed: t("receipts.completed"),
  };

  useEffect(() => {
    if (!requestKey || !appointmentId) return;
    let active = true;
    const load = kind === "appointment" ? receiptsApi.list : receiptsApi.listLabTest;
    load(appointmentId)
      .then((res) => {
        if (!active) return;
        setDownloadError(null);
        setResult({ key: requestKey, receipts: res.data, error: null });
      })
      .catch((err) => {
        if (!active) return;
        setDownloadError(null);
        setResult({
          key: requestKey,
          receipts: [],
          error: err instanceof ApiError ? err.message : t("receipts.loadFailed"),
        });
      });
    return () => {
      active = false;
    };
  }, [requestKey, appointmentId, kind, t]);

  const download = async (receipt: Receipt) => {
    if (!appointmentId) return;
    if (downloadAction.isPending(receipt.id)) return;
    setDownloadError(null);
    await downloadAction.run(receipt.id, async () => {
      try {
        const blob =
          kind === "appointment"
            ? await receiptsApi.pdf(appointmentId, receipt.id)
            : await receiptsApi.pdfLabTest(appointmentId, receipt.id);
        downloadBlob(blob, `receipt-${receipt.receipt_number}.pdf`);
      } catch (err) {
        setDownloadError(err instanceof ApiError ? err.message : t("receipts.downloadFailed"));
      }
    });
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} className="max-w-[560px] p-6 lg:p-8">
      <h5 className="text-lg font-semibold text-gray-800 dark:text-white/90">{t("receipts.title")}</h5>

      {error && (
        <div className="mt-4 rounded-lg border border-error-500/30 bg-error-50 px-4 py-3 text-sm text-error-600 dark:bg-error-500/10 dark:text-error-400">
          {error}
          {!downloadError && loadError && (
            <button
              type="button"
              onClick={() => setReloadKey((k) => k + 1)}
              className="ml-2 font-medium text-brand-500 hover:text-brand-600"
            >
              {t("common.retry")}
            </button>
          )}
        </div>
      )}

      <div className="mt-5 space-y-3">
        {loading ? (
          // Same footprint as a receipt row: two text lines + download button.
          <div role="status" aria-busy="true" className="space-y-3">
            <span className="sr-only">{t("common.loading")}</span>
            {[0, 1].map((i) => (
              <div
                key={i}
                className="flex items-center justify-between gap-3 rounded-lg border border-gray-100 px-4 py-3 dark:border-gray-800"
              >
                <div className="min-w-0 flex-1 space-y-1.5">
                  <Skeleton className="h-3.5 w-32" />
                  <Skeleton className="h-3 w-56 max-w-full" />
                </div>
                <Skeleton className="h-7 w-24 shrink-0 rounded-lg" />
              </div>
            ))}
          </div>
        ) : receipts.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">{t("receipts.none")}</p>
        ) : (
          receipts.map((r) => {
            const downloading = downloadAction.isPending(r.id);
            return (
            <div
              key={r.id}
              className="flex items-center justify-between gap-3 rounded-lg border border-gray-100 px-4 py-3 dark:border-gray-800"
            >
              <div>
                <p className="text-theme-sm font-medium text-gray-800 dark:text-white/90">
                  {EVENT_LABEL[r.event_type]}
                </p>
                <p className="mt-0.5 text-theme-xs text-gray-500 dark:text-gray-400">
                  {r.receipt_number} · {new Date(r.created_at).toLocaleString()}
                  {r.amount !== null ? ` · ${r.amount} ${r.currency}` : ""}
                </p>
              </div>
              <button
                type="button"
                onClick={() => download(r)}
                disabled={downloading}
                className="rounded-lg bg-brand-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-600 disabled:cursor-not-allowed disabled:bg-brand-300"
              >
                {downloading ? t("receipts.downloading") : t("receipts.downloadPdf")}
              </button>
            </div>
            );
          })
        )}
      </div>

      <div className="mt-6 flex justify-end">
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-white/[0.03]"
        >
          {t("receipts.close")}
        </button>
      </div>
    </Modal>
  );
}
