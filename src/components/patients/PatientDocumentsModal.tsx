"use client";
import React, { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import { Modal } from "@/components/ui/modal";
import Badge, { BadgeColor } from "@/components/ui/badge/Badge";
import { DetailSkeleton } from "@/components/ui/skeleton/Skeleton";
import { useAuth } from "@/context/AuthContext";
import { useTranslation } from "@/hooks/useTranslation";
import { getErrorMessage } from "@/lib/errorMessage";
import { downloadBlob, formatDate, formatDateTime } from "@/lib/utils";
import {
  canDeletePatientDocuments,
  canEmailPatientDocuments,
  canPrintPatientDocuments,
  canUploadPatientDocuments,
  canViewPatientDocuments,
} from "@/lib/permissions";
import {
  PatientDocument,
  PatientDocumentDelivery,
  PatientDocumentDeliveryMethod,
  PatientDocumentGenerationStatus,
  PatientDocumentType,
  patientDocumentsApi,
} from "@/lib/api";

interface PatientDocumentsModalProps {
  isOpen: boolean;
  onClose: () => void;
  patientId: string;
  patientName: string;
  patientEmail?: string | null;
  branchId?: string | null;
  // Optional "Overview" tab fields — only PatientsPanel has the full Patient
  // record; the Doctor/Lab list panels omit these and the tab renders "—".
  patientPhone?: string | null;
  patientAddress?: string | null;
  visitCount?: number;
  isNewPatient?: boolean;
  firstVisitDate?: string | null;
  lastVisitDate?: string | null;
}

type Tab = "overview" | "documents";

const DOCUMENT_TYPES: PatientDocumentType[] = ["LAB_REPORT", "PRESCRIPTION", "OTHER"];
const STATUS_FILTERS: PatientDocumentGenerationStatus[] = ["PENDING", "GENERATED"];
const ACCEPTED_TYPES = "application/pdf,image/jpeg,image/jpg,image/png";
const MAX_FILE_SIZE = 20 * 1024 * 1024;

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

type HistoryEvent =
  | { kind: "uploaded"; at: string; byName: string }
  | { kind: "delivery"; delivery: PatientDocumentDelivery };

export default function PatientDocumentsModal({
  isOpen,
  onClose,
  patientId,
  patientName,
  patientEmail,
  branchId,
  patientPhone,
  patientAddress,
  visitCount,
  isNewPatient,
  firstVisitDate,
  lastVisitDate,
}: PatientDocumentsModalProps) {
  const { t } = useTranslation();
  const { user } = useAuth();

  const isOwner = user?.role === "clinic_owner" || user?.role === "sys_admin";
  const staffPermissions = user?.role === "branch_staff" ? user.permissions : undefined;
  const canView = isOwner || canViewPatientDocuments(staffPermissions);
  const canUpload = isOwner || canUploadPatientDocuments(staffPermissions);
  const canDelete = isOwner || canDeletePatientDocuments(staffPermissions);
  const canEmail = isOwner || canEmailPatientDocuments(staffPermissions);
  const canPrint = isOwner || canPrintPatientDocuments(staffPermissions);

  const [activeTab, setActiveTab] = useState<Tab>("documents");

  const [items, setItems] = useState<PatientDocument[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [typeFilter, setTypeFilter] = useState<PatientDocumentType | "">("");
  const [statusFilter, setStatusFilter] = useState<PatientDocumentGenerationStatus | "">("");

  const [showUploadForm, setShowUploadForm] = useState(false);
  const [uploadType, setUploadType] = useState<PatientDocumentType>("LAB_REPORT");
  const [uploadTitle, setUploadTitle] = useState("");
  const [uploadDescription, setUploadDescription] = useState("");
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  const [emailTargetId, setEmailTargetId] = useState<string | null>(null);
  const [emailValue, setEmailValue] = useState("");
  const [emailBusy, setEmailBusy] = useState(false);

  const [historyTargetId, setHistoryTargetId] = useState<string | null>(null);
  const [historyEvents, setHistoryEvents] = useState<HistoryEvent[] | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);

  const [busyAction, setBusyAction] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!canView) return;
    setLoading(true);
    setError(null);
    try {
      const res = await patientDocumentsApi.listByPatient(patientId, {
        document_type: typeFilter || undefined,
        status: statusFilter || undefined,
      });
      setItems(res.items);
    } catch (err) {
      setError(getErrorMessage(err, t("patientDocuments.failedToLoad")));
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patientId, typeFilter, statusFilter, canView]);

  useEffect(() => {
    if (isOpen) load();
  }, [isOpen, load]);

  const resetUploadForm = () => {
    setUploadType("LAB_REPORT");
    setUploadTitle("");
    setUploadDescription("");
    setUploadFile(null);
  };

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uploadFile || !uploadTitle.trim()) return;
    if (uploadFile.size > MAX_FILE_SIZE) {
      toast.error(t("patientDocuments.fileTooLarge"));
      return;
    }
    setUploading(true);
    try {
      await patientDocumentsApi.upload({
        patient_id: patientId,
        document_type: uploadType,
        title: uploadTitle.trim(),
        description: uploadDescription.trim() || undefined,
        branch_id: isOwner ? branchId ?? undefined : undefined,
        file: uploadFile,
      });
      toast.success(t("patientDocuments.uploadSuccess"));
      resetUploadForm();
      setShowUploadForm(false);
      load();
    } catch (err) {
      toast.error(getErrorMessage(err, t("patientDocuments.uploadFailed")));
    } finally {
      setUploading(false);
    }
  };

  const handleDownload = async (doc: PatientDocument) => {
    setBusyAction(`download:${doc.id}`);
    try {
      const blob = await patientDocumentsApi.download(doc.id);
      downloadBlob(blob, doc.file_name);
    } catch (err) {
      toast.error(getErrorMessage(err, t("patientDocuments.downloadFailed")));
    } finally {
      setBusyAction(null);
    }
  };

  const openEmailForm = (doc: PatientDocument) => {
    setHistoryTargetId(null);
    setEmailTargetId(doc.id);
    setEmailValue(patientEmail ?? "");
  };

  const handleSendEmail = async (documentId: string) => {
    if (!emailValue.trim()) return;
    setEmailBusy(true);
    try {
      const delivery = await patientDocumentsApi.sendEmail(documentId, emailValue.trim());
      if (delivery.status === "DELIVERED") {
        toast.success(t("patientDocuments.emailSuccess"));
      } else {
        toast.error(delivery.error_message || t("patientDocuments.emailFailed"));
      }
      setEmailTargetId(null);
      load();
    } catch (err) {
      toast.error(getErrorMessage(err, t("patientDocuments.emailFailed")));
    } finally {
      setEmailBusy(false);
    }
  };

  const handlePrint = async (doc: PatientDocument) => {
    setBusyAction(`print:${doc.id}`);
    try {
      window.open(doc.file_url, "_blank", "noopener,noreferrer");
      await patientDocumentsApi.print(doc.id);
      toast.success(t("patientDocuments.printSuccess"));
      load();
    } catch (err) {
      toast.error(getErrorMessage(err, t("patientDocuments.printFailed")));
    } finally {
      setBusyAction(null);
    }
  };

  const handleDelete = async (doc: PatientDocument) => {
    if (!window.confirm(t("patientDocuments.deleteConfirm"))) return;
    setBusyAction(`delete:${doc.id}`);
    try {
      await patientDocumentsApi.remove(doc.id);
      toast.success(t("patientDocuments.deleteSuccess"));
      load();
    } catch (err) {
      toast.error(getErrorMessage(err, t("patientDocuments.deleteFailed")));
    } finally {
      setBusyAction(null);
    }
  };

  const toggleHistory = async (doc: PatientDocument) => {
    if (historyTargetId === doc.id) {
      setHistoryTargetId(null);
      return;
    }
    setEmailTargetId(null);
    setHistoryTargetId(doc.id);
    setHistoryEvents(null);
    setHistoryLoading(true);
    try {
      const detail = await patientDocumentsApi.get(doc.id);
      const events: HistoryEvent[] = [
        { kind: "uploaded", at: detail.uploaded_at, byName: detail.uploaded_by_name },
        ...detail.deliveries
          .filter((d) => d.delivery_method !== "APP")
          .map((d): HistoryEvent => ({ kind: "delivery", delivery: d })),
      ];
      setHistoryEvents(events);
    } catch (err) {
      toast.error(getErrorMessage(err, t("patientDocuments.historyFailed")));
      setHistoryTargetId(null);
    } finally {
      setHistoryLoading(false);
    }
  };

  const statusBadgeColor = (status: PatientDocumentGenerationStatus): BadgeColor =>
    status === "GENERATED" ? "success" : "warning";

  const typeLabel = (type: PatientDocumentType) => t(`patientDocuments.type.${type}`);

  // Per-channel status, shown independently — never overwritten by another
  // channel's state (App/Email/Print each keep their own row + wording).
  const channelStatusLabel = (
    method: PatientDocumentDeliveryMethod,
    delivery: PatientDocumentDelivery | null
  ): string => {
    if (!delivery) return t("patientDocuments.channelNotSent");
    if (method === "APP") {
      return delivery.status === "DELIVERED"
        ? t("patientDocuments.channelAvailable")
        : t("patientDocuments.channelNotSent");
    }
    if (method === "PRINT" && delivery.status === "DELIVERED") {
      return t("patientDocuments.channelPrinted");
    }
    return t(`patientDocuments.deliveryStatus.${delivery.status}`);
  };

  const channelStatusColor = (delivery: PatientDocumentDelivery | null): BadgeColor => {
    if (!delivery) return "light";
    return delivery.status === "DELIVERED" ? "success" : delivery.status === "PENDING" ? "warning" : "error";
  };

  const historyEventLabel = (delivery: PatientDocumentDelivery): string => {
    if (delivery.delivery_method === "EMAIL") {
      if (delivery.status === "DELIVERED") return t("patientDocuments.historyEvent.emailDelivered");
      if (delivery.status === "NOT_DELIVERED") return t("patientDocuments.historyEvent.emailNotDelivered");
      return t("patientDocuments.historyEvent.emailPending");
    }
    if (delivery.status === "DELIVERED") return t("patientDocuments.historyEvent.printed");
    if (delivery.status === "NOT_DELIVERED") return t("patientDocuments.historyEvent.printFailed");
    return t("patientDocuments.historyEvent.printPending");
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} className="max-w-[860px] p-6 lg:p-8">
      <div className="flex items-start justify-between">
        <div>
          <h5 className="text-lg font-semibold text-gray-800 dark:text-white/90">
            {t("patients.patientDetails")}
          </h5>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{patientName}</p>
        </div>
      </div>

      <div className="mt-4 flex gap-1 border-b border-gray-200 dark:border-gray-800">
        <TabButton
          active={activeTab === "overview"}
          onClick={() => setActiveTab("overview")}
          label={t("patientDocuments.overview")}
        />
        <TabButton
          active={activeTab === "documents"}
          onClick={() => setActiveTab("documents")}
          label={t("patientDocuments.documentsAndReports")}
        />
      </div>

      {activeTab === "overview" ? (
        <div className="mt-5 space-y-2">
          <OverviewRow label={t("patients.name")} value={patientName} />
          <OverviewRow label={t("patients.email")} value={patientEmail || "—"} />
          <OverviewRow label={t("patients.phone")} value={patientPhone || "—"} />
          <OverviewRow label={t("patients.address")} value={patientAddress || "—"} />
          <OverviewRow
            label={t("patients.visits")}
            value={visitCount !== undefined ? String(visitCount) : "—"}
          />
          {isNewPatient !== undefined && (
            <div className="flex items-center justify-between gap-3 py-1.5">
              <dt className="text-sm text-gray-500 dark:text-gray-400">{t("patients.type")}</dt>
              <dd>
                <Badge size="sm" color={isNewPatient ? "info" : "success"}>
                  {isNewPatient ? t("patients.new") : t("patients.returning")}
                </Badge>
              </dd>
            </div>
          )}
          <OverviewRow
            label={t("patients.firstVisit")}
            value={firstVisitDate ? formatDate(firstVisitDate) : "—"}
          />
          <OverviewRow
            label={t("patients.lastVisit")}
            value={lastVisitDate ? formatDate(lastVisitDate) : "—"}
          />
        </div>
      ) : !canView ? (
        <p className="mt-6 rounded-lg border border-gray-200 px-4 py-6 text-center text-sm text-gray-500 dark:border-gray-800 dark:text-gray-400">
          {t("patientDocuments.noPermissionView")}
        </p>
      ) : (
        <div className="mt-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div className="flex flex-col gap-3 sm:flex-row">
              <div className="sm:w-44">
                <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-gray-400 dark:text-gray-500">
                  {t("patientDocuments.documentType")}
                </label>
                <select
                  value={typeFilter}
                  onChange={(e) => setTypeFilter(e.target.value as PatientDocumentType | "")}
                  className="h-10 w-full rounded-lg border border-gray-300 bg-transparent px-3 text-sm text-gray-800 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
                >
                  <option value="">{t("patientDocuments.allTypes")}</option>
                  {DOCUMENT_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {typeLabel(type)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="sm:w-40">
                <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-gray-400 dark:text-gray-500">
                  {t("patientDocuments.status")}
                </label>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value as PatientDocumentGenerationStatus | "")}
                  className="h-10 w-full rounded-lg border border-gray-300 bg-transparent px-3 text-sm text-gray-800 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
                >
                  <option value="">{t("patientDocuments.allStatuses")}</option>
                  {STATUS_FILTERS.map((s) => (
                    <option key={s} value={s}>
                      {t(`patientDocuments.generationStatus.${s}`)}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {canUpload && (
              <button
                onClick={() => setShowUploadForm((v) => !v)}
                className="h-10 shrink-0 rounded-lg bg-brand-500 px-4 text-sm font-medium text-white hover:bg-brand-600"
              >
                {showUploadForm ? t("appointments.close") : t("patientDocuments.uploadDocument")}
              </button>
            )}
          </div>

          {showUploadForm && canUpload && (
            <form
              onSubmit={handleUpload}
              className="mt-4 space-y-3 rounded-xl border border-gray-200 p-4 dark:border-gray-800"
            >
              <h6 className="text-sm font-semibold text-gray-800 dark:text-white/90">
                {t("patientDocuments.uploadDocument")}
              </h6>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-gray-400 dark:text-gray-500">
                    {t("patientDocuments.documentType")}
                  </label>
                  <select
                    value={uploadType}
                    onChange={(e) => setUploadType(e.target.value as PatientDocumentType)}
                    className="h-10 w-full rounded-lg border border-gray-300 bg-transparent px-3 text-sm text-gray-800 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
                  >
                    {DOCUMENT_TYPES.map((type) => (
                      <option key={type} value={type}>
                        {typeLabel(type)}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-gray-400 dark:text-gray-500">
                    {t("patientDocuments.titleLabel")}
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={255}
                    value={uploadTitle}
                    onChange={(e) => setUploadTitle(e.target.value)}
                    placeholder={t("patientDocuments.titlePlaceholder")}
                    className="h-10 w-full rounded-lg border border-gray-300 bg-transparent px-3 text-sm text-gray-800 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
                  />
                </div>
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-gray-400 dark:text-gray-500">
                  {t("patientDocuments.descriptionLabel")}
                </label>
                <textarea
                  value={uploadDescription}
                  onChange={(e) => setUploadDescription(e.target.value)}
                  maxLength={2000}
                  rows={2}
                  placeholder={t("patientDocuments.descriptionPlaceholder")}
                  className="w-full rounded-lg border border-gray-300 bg-transparent px-3 py-2 text-sm text-gray-800 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-gray-400 dark:text-gray-500">
                  {t("patientDocuments.fileLabel")}
                </label>
                <input
                  type="file"
                  required
                  accept={ACCEPTED_TYPES}
                  onChange={(e) => setUploadFile(e.target.files?.[0] ?? null)}
                  className="block w-full text-sm text-gray-600 file:mr-3 file:rounded-lg file:border-0 file:bg-brand-50 file:px-3 file:py-2 file:text-sm file:font-medium file:text-brand-600 hover:file:bg-brand-100 dark:text-gray-300 dark:file:bg-brand-500/10 dark:file:text-brand-400"
                />
                <p className="mt-1 text-theme-xs text-gray-400 dark:text-gray-500">
                  {t("patientDocuments.fileHint")}
                </p>
              </div>
              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setShowUploadForm(false);
                    resetUploadForm();
                  }}
                  className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-white/[0.03]"
                >
                  {t("appointments.close")}
                </button>
                <button
                  type="submit"
                  disabled={uploading || !uploadFile || !uploadTitle.trim()}
                  className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600 disabled:bg-brand-300"
                >
                  {uploading ? t("patientDocuments.uploading") : t("patientDocuments.upload")}
                </button>
              </div>
            </form>
          )}

          {error && (
            <div className="mt-4 rounded-lg border border-error-500/30 bg-error-50 px-4 py-3 text-sm text-error-600 dark:bg-error-500/10 dark:text-error-400">
              {error}
            </div>
          )}

          <div className="mt-4 max-h-[50vh] overflow-y-auto">
            {loading ? (
              <DetailSkeleton rows={3} />
            ) : items.length === 0 ? (
              <p className="py-10 text-center text-sm text-gray-500 dark:text-gray-400">
                {t("patientDocuments.noDocuments")}
              </p>
            ) : (
              <div className="space-y-3">
                {items.map((doc) => (
                  <div
                    key={doc.id}
                    className="rounded-xl border border-gray-200 p-4 dark:border-gray-800"
                  >
                    {emailTargetId === doc.id ? (
                      <div>
                        <h6 className="text-sm font-semibold text-gray-800 dark:text-white/90">
                          {t("patientDocuments.sendEmailTitle")}
                        </h6>
                        <div className="mt-3">
                          <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-gray-400 dark:text-gray-500">
                            {t("patientDocuments.patientEmailLabel")}
                          </label>
                          <input
                            type="email"
                            value={emailValue}
                            onChange={(e) => setEmailValue(e.target.value)}
                            placeholder={t("patientDocuments.emailPlaceholder")}
                            autoFocus
                            className="h-10 w-full rounded-lg border border-gray-300 bg-transparent px-3 text-sm text-gray-800 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
                          />
                        </div>
                        <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">
                          {t("patientDocuments.sendEmailConfirm")}
                        </p>
                        <div className="mt-4 flex justify-end gap-3">
                          <button
                            onClick={() => setEmailTargetId(null)}
                            className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300"
                          >
                            {t("appointments.close")}
                          </button>
                          <button
                            onClick={() => handleSendEmail(doc.id)}
                            disabled={emailBusy || !emailValue.trim()}
                            className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600 disabled:bg-brand-300"
                          >
                            {emailBusy ? t("patientDocuments.sending") : t("patientDocuments.send")}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                          <div>
                            <p className="font-medium text-gray-800 dark:text-white/90">{doc.title}</p>
                            <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
                              {typeLabel(doc.document_type)} · {formatDate(doc.uploaded_at)}
                            </p>
                            <div className="mt-1.5">
                              <Badge size="sm" color={statusBadgeColor(doc.status)}>
                                {t(`patientDocuments.generationStatus.${doc.status}`)}
                              </Badge>
                            </div>
                            {doc.description && (
                              <p className="mt-1.5 text-sm text-gray-500 dark:text-gray-400">
                                {doc.description}
                              </p>
                            )}
                            <p className="mt-1 text-theme-xs text-gray-400 dark:text-gray-500">
                              {doc.file_name} · {formatFileSize(doc.file_size)}
                            </p>
                          </div>
                        </div>

                        <div className="mt-3 flex flex-wrap items-center gap-1.5">
                          <a
                            href={doc.file_url}
                            target="_blank"
                            rel="noreferrer"
                            className="rounded-lg px-2 py-1.5 text-xs font-medium text-gray-500 hover:bg-gray-100 hover:text-gray-800 dark:text-gray-400 dark:hover:bg-white/5 dark:hover:text-gray-200"
                          >
                            {t("patientDocuments.view")}
                          </a>
                          <button
                            onClick={() => handleDownload(doc)}
                            disabled={busyAction === `download:${doc.id}`}
                            className="rounded-lg px-2 py-1.5 text-xs font-medium text-brand-500 hover:bg-brand-50 disabled:opacity-50 dark:hover:bg-brand-500/10"
                          >
                            {busyAction === `download:${doc.id}`
                              ? t("patientDocuments.downloading")
                              : t("patientDocuments.download")}
                          </button>
                          {canEmail && (
                            <button
                              onClick={() => openEmailForm(doc)}
                              className="rounded-lg px-2 py-1.5 text-xs font-medium text-gray-500 hover:bg-gray-100 hover:text-gray-800 dark:text-gray-400 dark:hover:bg-white/5 dark:hover:text-gray-200"
                            >
                              {t("patientDocuments.email")}
                            </button>
                          )}
                          {canPrint && (
                            <button
                              onClick={() => handlePrint(doc)}
                              disabled={busyAction === `print:${doc.id}`}
                              className="rounded-lg px-2 py-1.5 text-xs font-medium text-gray-500 hover:bg-gray-100 hover:text-gray-800 disabled:opacity-50 dark:text-gray-400 dark:hover:bg-white/5 dark:hover:text-gray-200"
                            >
                              {busyAction === `print:${doc.id}`
                                ? t("patientDocuments.printing")
                                : t("patientDocuments.print")}
                            </button>
                          )}
                          <button
                            onClick={() => toggleHistory(doc)}
                            className="rounded-lg px-2 py-1.5 text-xs font-medium text-gray-500 hover:bg-gray-100 hover:text-gray-800 dark:text-gray-400 dark:hover:bg-white/5 dark:hover:text-gray-200"
                          >
                            {historyTargetId === doc.id
                              ? t("patientDocuments.hideHistory")
                              : t("patientDocuments.history")}
                          </button>
                          {canDelete && (
                            <button
                              onClick={() => handleDelete(doc)}
                              disabled={busyAction === `delete:${doc.id}`}
                              className="rounded-lg px-2 py-1.5 text-xs font-medium text-error-600 hover:bg-error-50 disabled:opacity-50 dark:hover:bg-error-500/10"
                            >
                              {busyAction === `delete:${doc.id}`
                                ? t("patientDocuments.deleting")
                                : t("patientDocuments.delete")}
                            </button>
                          )}
                        </div>

                        {/* Independent per-channel delivery status — each row keeps its own
                            state, never overwritten by another channel. */}
                        <div className="mt-3 flex flex-col gap-1.5 border-t border-gray-100 pt-3 dark:border-gray-800 sm:flex-row sm:gap-6">
                          <ChannelRow
                            label={t("patientDocuments.channel.APP")}
                            value={channelStatusLabel("APP", doc.delivery_summary.APP)}
                            color={channelStatusColor(doc.delivery_summary.APP)}
                          />
                          <ChannelRow
                            label={t("patientDocuments.channel.EMAIL")}
                            value={channelStatusLabel("EMAIL", doc.delivery_summary.EMAIL)}
                            color={channelStatusColor(doc.delivery_summary.EMAIL)}
                          />
                          <ChannelRow
                            label={t("patientDocuments.channel.PRINT")}
                            value={channelStatusLabel("PRINT", doc.delivery_summary.PRINT)}
                            color={channelStatusColor(doc.delivery_summary.PRINT)}
                          />
                        </div>

                        {historyTargetId === doc.id && (
                          <div className="mt-3 rounded-lg bg-gray-50 p-3 dark:bg-white/[0.03]">
                            <h6 className="text-sm font-semibold text-gray-800 dark:text-white/90">
                              {t("patientDocuments.documentHistory")}
                            </h6>
                            {historyLoading ? (
                              <div className="mt-2">
                                <DetailSkeleton rows={2} />
                              </div>
                            ) : (
                              <div className="mt-2 space-y-3">
                                {historyEvents?.map((event, i) =>
                                  event.kind === "uploaded" ? (
                                    <HistoryRow
                                      key={`uploaded-${i}`}
                                      title={t("patientDocuments.historyEvent.uploaded")}
                                      at={event.at}
                                      subline={t("patientDocuments.byStaff", { name: event.byName })}
                                    />
                                  ) : (
                                    <HistoryRow
                                      key={event.delivery.id}
                                      title={historyEventLabel(event.delivery)}
                                      at={event.delivery.delivered_at ?? event.delivery.attempted_at}
                                      subline={
                                        event.delivery.recipient_email ??
                                        (event.delivery.attempted_by_name
                                          ? t("patientDocuments.byStaff", {
                                              name: event.delivery.attempted_by_name,
                                            })
                                          : "—")
                                      }
                                    />
                                  )
                                )}
                              </div>
                            )}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      <div className="mt-6 flex justify-end">
        <button
          onClick={onClose}
          className="rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-white/[0.03]"
        >
          {t("appointments.close")}
        </button>
      </div>
    </Modal>
  );
}

function TabButton({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`border-b-2 px-4 py-2 text-sm font-medium ${
        active
          ? "border-brand-500 text-brand-500"
          : "border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
      }`}
    >
      {label}
    </button>
  );
}

function OverviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5">
      <dt className="text-sm text-gray-500 dark:text-gray-400">{label}</dt>
      <dd className="text-sm font-medium text-gray-800 dark:text-white/90">{value}</dd>
    </div>
  );
}

function ChannelRow({ label, value, color }: { label: string; value: string; color: BadgeColor }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="text-gray-500 dark:text-gray-400">{label}</span>
      <Badge size="sm" color={color}>
        {value}
      </Badge>
    </div>
  );
}

function HistoryRow({ title, at, subline }: { title: string; at: string; subline: string }) {
  return (
    <div className="border-l-2 border-gray-200 pl-3 dark:border-gray-700">
      <p className="text-sm font-medium text-gray-800 dark:text-white/90">{title}</p>
      <p className="text-theme-xs text-gray-500 dark:text-gray-400">{formatDateTime(at)}</p>
      <p className="text-theme-xs text-gray-400 dark:text-gray-500">{subline}</p>
    </div>
  );
}
