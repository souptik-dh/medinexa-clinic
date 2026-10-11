"use client";
import React, { useCallback, useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import Badge from "@/components/ui/badge/Badge";
import type { BadgeColor } from "@/components/ui/badge/Badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TableRowsSkeleton } from "@/components/ui/skeleton/Skeleton";
import { useKeyedAction, useLatestRequest } from "@/hooks/useAsyncAction";
import {
  ClinicPrescription,
  ClinicPrescriptionListResponse,
  ClinicPrescriptionSource,
  clinicPrescriptionsApi,
} from "@/lib/api";
import { downloadBlob, formatDateTime } from "@/lib/utils";
import { getErrorMessage } from "@/lib/errorMessage";
import { useTranslation } from "@/hooks/useTranslation";

const PAGE_SIZE = 20;
const SEARCH_DEBOUNCE_MS = 350;

type Filter = "all" | "clinic" | "patient";

const TABS: { value: Filter; labelKey: string; sources: ClinicPrescriptionSource[] }[] = [
  { value: "all", labelKey: "prescriptions.filterAll", sources: [] },
  { value: "clinic", labelKey: "prescriptions.byClinic", sources: ["clinic_upload"] },
  { value: "patient", labelKey: "prescriptions.byPatient", sources: ["lab_booking", "patient_upload"] },
];

const sourcesFor = (f: Filter) => TABS.find((tab) => tab.value === f)?.sources ?? [];

const SOURCE_META:Record<ClinicPrescriptionSource, { labelKey: string; color: BadgeColor }> = {
  clinic_upload: { labelKey: "prescriptions.sourceClinic", color: "info" },
  lab_booking: { labelKey: "prescriptions.sourceLabBooking", color: "warning" },
  patient_upload: { labelKey: "prescriptions.sourcePatient", color: "success" },
};

function isPdf(p: ClinicPrescription): boolean {
  return p.mime_type === "application/pdf" || /\.pdf$/i.test(p.file_name);
}

function fileExt(p: ClinicPrescription): string {
  if (isPdf(p)) return "PDF";
  const ext = /\.([a-z0-9]{2,4})$/i.exec(p.file_name)?.[1] ?? p.mime_type?.split("/")[1] ?? "";
  return ext.toUpperCase().replace("JPEG", "JPG") || "FILE";
}

function formatSize(bytes: number): string {
  if (!bytes) return "—";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** DB timestamps may come back as "YYYY-MM-DD HH:MM:SS" (UTC) rather than ISO. */
function toIso(value: string): string {
  if (!value) return value;
  return value.includes("T") ? value : `${value.replace(" ", "T")}Z`;
}

export default function ClinicPrescriptionFilesSection() {
  const { t } = useTranslation();
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<ClinicPrescription[]>([]);
  const [counts, setCounts] = useState<ClinicPrescriptionListResponse["counts"] | null>(null);
  const [allowed, setAllowed] = useState<ClinicPrescriptionSource[]>([
    "clinic_upload",
    "lab_booking",
    "patient_upload",
  ]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { begin, isLatest } = useLatestRequest();
  const download = useKeyedAction<string>();
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounce typing into the query that actually drives the request.
  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => setQuery(search.trim()), SEARCH_DEBOUNCE_MS);
    return () => {
      if (searchTimer.current) clearTimeout(searchTimer.current);
    };
  }, [search]);

  const load = useCallback(async () => {
    const token = begin();
    setLoading(true);
    setItems([]);
    setNextCursor(null);
    setError(null);
    try {
      const res = await clinicPrescriptionsApi.list({
        source: sourcesFor(filter),
        q: query || undefined,
        limit: PAGE_SIZE,
      });
      if (!isLatest(token)) return;
      setItems(res.items ?? []);
      setCounts(res.counts ?? null);
      if (res.allowed_sources) setAllowed(res.allowed_sources);
      setNextCursor(res.next_cursor);
    } catch (err) {
      if (!isLatest(token)) return;
      setError(getErrorMessage(err, t("prescriptions.loadFilesFailed")));
    } finally {
      if (isLatest(token)) setLoading(false);
    }
  }, [filter, query, t, begin, isLatest]);

  useEffect(() => {
    load();
  }, [load]);

  const loadMore = async () => {
    if (!nextCursor || loadingMore) return;
    // Tied to the current list: a filter/search change in the meantime discards it.
    const token = begin();
    setLoadingMore(true);
    try {
      const res = await clinicPrescriptionsApi.list({
        source: sourcesFor(filter),
        q: query || undefined,
        limit: PAGE_SIZE,
        cursor: nextCursor,
      });
      if (!isLatest(token)) return;
      setItems((prev) => {
        const seen = new Set(prev.map((p) => p.source + p.id));
        return [...prev, ...(res.items ?? []).filter((p) => !seen.has(p.source + p.id))];
      });
      setNextCursor(res.next_cursor);
    } catch (err) {
      if (!isLatest(token)) return;
      toast.error(getErrorMessage(err, t("prescriptions.loadFilesFailed")));
    } finally {
      setLoadingMore(false);
    }
  };

  const view = (p: ClinicPrescription) => {
    window.open(p.file_url, "_blank", "noopener,noreferrer");
  };

  const downloadFile = async (p: ClinicPrescription) => {
    await download.run(p.source + p.id, async () => {
      try {
        const blob = await clinicPrescriptionsApi.download(p);
        downloadBlob(blob, p.file_name || `prescription-${p.id.slice(0, 8)}`);
      } catch (err) {
        toast.error(getErrorMessage(err, t("prescriptions.downloadFailed")));
      }
    });
  };

  const countFor = (f: Filter): number | null => {
    if (!counts) return null;
    if (f === "clinic") return counts.clinic_upload;
    if (f === "patient") return counts.lab_booking + counts.patient_upload;
    return counts.total;
  };

  // Staff lacking a permission don't see that source's tab; "All" stays.
  const visibleTabs = TABS.filter(
    (tab) => tab.sources.length === 0 || tab.sources.some((s) => allowed.includes(s))
  );

  return (
    <div>
      {/* Filters */}
      <div className="mb-4 flex flex-col gap-3 rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03] sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-2">
          {visibleTabs.map((tab) => {
            const active = filter === tab.value;
            const count = countFor(tab.value);
            return (
              <button
                key={tab.value}
                type="button"
                onClick={() => setFilter(tab.value)}
                aria-pressed={active}
                className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition ${
                  active
                    ? "bg-brand-500 text-white"
                    : "bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-white/[0.05] dark:text-gray-300 dark:hover:bg-white/[0.08]"
                }`}
              >
                {t(tab.labelKey)}
                {count !== null && (
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs ${
                      active ? "bg-white/20 text-white" : "bg-white text-gray-600 dark:bg-gray-800 dark:text-gray-400"
                    }`}
                  >
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("prescriptions.searchPlaceholder")}
          className="h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 text-sm text-gray-800 placeholder:text-gray-400 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90 dark:placeholder:text-white/30 sm:w-80"
        />
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-error-500/30 bg-error-50 px-4 py-3 text-sm text-error-600 dark:bg-error-500/10 dark:text-error-400">
          {error}
          {!loading && (
            <button type="button" onClick={load} className="ml-3 font-medium underline hover:no-underline">
              {t("common.retry")}
            </button>
          )}
        </div>
      )}

      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white px-4 pb-4 pt-4 dark:border-gray-800 dark:bg-white/[0.03] sm:px-6">
        {!loading && items.length === 0 ? (
          <p className="py-10 text-center text-sm text-gray-500 dark:text-gray-400">
            {error ? "" : t("prescriptions.noFiles")}
          </p>
        ) : (
          <div className="max-w-full overflow-x-auto">
            <Table>
              <TableHeader className="border-gray-100 dark:border-gray-800 border-y">
                <TableRow>
                  {[
                    t("prescriptions.file"),
                    t("prescriptions.patient"),
                    t("prescriptions.branch"),
                    t("prescriptions.uploaded"),
                    t("prescriptions.status"),
                  ].map((label) => (
                    <TableCell
                      key={label}
                      isHeader
                      className="py-3 font-medium text-gray-500 text-start text-theme-xs dark:text-gray-400"
                    >
                      {label}
                    </TableCell>
                  ))}
                  <TableCell isHeader className="py-3 font-medium text-gray-500 text-end text-theme-xs dark:text-gray-400">
                    {t("prescriptions.actions")}
                  </TableCell>
                </TableRow>
              </TableHeader>
              <TableBody className="divide-y divide-gray-100 dark:divide-gray-800">
                {loading ? (
                  <TableRowsSkeleton rows={6} cols={6} actions cellClassName="py-3" />
                ) : (
                  items.map((p) => {
                    const meta = SOURCE_META[p.source];
                    const key = p.source + p.id;
                    const busy = download.isPending(key);
                    return (
                      <TableRow key={key}>
                        <TableCell className="py-3">
                          <div className="flex items-center gap-3">
                            <span
                              className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-[10px] font-bold ${
                                isPdf(p)
                                  ? "bg-error-50 text-error-600 dark:bg-error-500/10 dark:text-error-400"
                                  : "bg-brand-50 text-brand-600 dark:bg-brand-500/10 dark:text-brand-400"
                              }`}
                            >
                              {fileExt(p)}
                            </span>
                            <div className="min-w-0">
                              <p
                                className="max-w-[240px] truncate font-medium text-gray-800 text-theme-sm dark:text-white/90"
                                title={p.title || p.file_name}
                              >
                                {p.title || p.file_name}
                              </p>
                              <p className="text-gray-500 text-theme-xs dark:text-gray-400">
                                {formatSize(p.file_size)}
                                {p.uploaded_by_name && ` · ${t("prescriptions.uploadedBy", { name: p.uploaded_by_name })}`}
                              </p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="py-3 text-gray-800 text-theme-sm dark:text-white/90">
                          {p.patient?.name || "—"}
                        </TableCell>
                        <TableCell className="py-3 text-gray-500 text-theme-sm dark:text-gray-400">
                          {p.branch?.name || "—"}
                        </TableCell>
                        <TableCell className="py-3 text-gray-500 text-theme-sm dark:text-gray-400">
                          {formatDateTime(toIso(p.uploaded_at))}
                        </TableCell>
                        <TableCell className="py-3">
                          <div className="flex flex-col items-start gap-1">
                            <Badge size="sm" color={meta.color}>
                              {t(meta.labelKey)}
                            </Badge>
                            {p.lab_appointment && (
                              <span className="text-gray-500 text-theme-xs dark:text-gray-400">
                                {t("prescriptions.labBookingNumber", {
                                  number: p.lab_appointment.appointment_number,
                                })}
                                {p.lab_appointment.status && ` · ${p.lab_appointment.status.replace(/_/g, " ")}`}
                              </span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="py-3">
                          <div className="flex justify-end gap-1">
                            <button
                              type="button"
                              onClick={() => view(p)}
                              className="rounded-lg px-2 py-1.5 text-xs font-medium text-brand-500 hover:bg-brand-50 dark:hover:bg-brand-500/10"
                            >
                              {t("prescriptions.view")}
                            </button>
                            <button
                              type="button"
                              onClick={() => downloadFile(p)}
                              disabled={busy}
                              className="rounded-lg px-2 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50 dark:text-gray-300 dark:hover:bg-white/[0.05]"
                            >
                              {busy ? t("prescriptions.downloading") : t("prescriptions.download")}
                            </button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        )}
        {!loading && nextCursor && (
          <div className="mt-4 flex justify-center">
            <button
              type="button"
              onClick={loadMore}
              disabled={loadingMore}
              className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-white/[0.03]"
            >
              {loadingMore ? t("prescriptions.loadingMore") : t("prescriptions.loadMore")}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
