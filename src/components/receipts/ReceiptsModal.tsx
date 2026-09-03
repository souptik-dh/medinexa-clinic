"use client";
import React, { useEffect, useState } from "react";
import { Modal } from "@/components/ui/modal";
import { ApiError, Receipt, receiptsApi } from "@/lib/api";
import { downloadBlob } from "@/lib/utils";
import { useTranslation } from "@/hooks/useTranslation";

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
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const EVENT_LABEL: Record<Receipt["event_type"], string> = {
    booking_confirmed: t("receipts.bookingConfirmed"),
    payment_received: t("receipts.paymentReceived"),
    completed: t("receipts.completed"),
  };

  useEffect(() => {
    if (!isOpen || !appointmentId) return;
    setLoading(true);
    setError(null);
    setReceipts([]);
    const load = kind === "appointment" ? receiptsApi.list : receiptsApi.listLabTest;
    load(appointmentId)
      .then((res) => setReceipts(res.data))
      .catch((err) => setError(err instanceof ApiError ? err.message : t("receipts.loadFailed")))
      .finally(() => setLoading(false));
  }, [isOpen, appointmentId, kind, t]);

  const download = async (receipt: Receipt) => {
    if (!appointmentId) return;
    setDownloadingId(receipt.id);
    setError(null);
    try {
      const blob =
        kind === "appointment"
          ? await receiptsApi.pdf(appointmentId, receipt.id)
          : await receiptsApi.pdfLabTest(appointmentId, receipt.id);
      downloadBlob(blob, `receipt-${receipt.receipt_number}.pdf`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("receipts.downloadFailed"));
    } finally {
      setDownloadingId(null);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} className="max-w-[560px] p-6 lg:p-8">
      <h5 className="text-lg font-semibold text-gray-800 dark:text-white/90">{t("receipts.title")}</h5>

      {error && (
        <div className="mt-4 rounded-lg border border-error-500/30 bg-error-50 px-4 py-3 text-sm text-error-600 dark:bg-error-500/10 dark:text-error-400">
          {error}
        </div>
      )}

      <div className="mt-5 space-y-3">
        {loading ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">{t("receipts.loading")}</p>
        ) : receipts.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">{t("receipts.none")}</p>
        ) : (
          receipts.map((r) => (
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
                onClick={() => download(r)}
                disabled={downloadingId === r.id}
                className="rounded-lg bg-brand-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-600 disabled:bg-brand-300"
              >
                {downloadingId === r.id ? t("receipts.downloading") : t("receipts.downloadPdf")}
              </button>
            </div>
          ))
        )}
      </div>

      <div className="mt-6 flex justify-end">
        <button
          onClick={onClose}
          className="rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-white/[0.03]"
        >
          {t("receipts.close")}
        </button>
      </div>
    </Modal>
  );
}
