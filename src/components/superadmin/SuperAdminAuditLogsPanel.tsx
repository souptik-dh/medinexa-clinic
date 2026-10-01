"use client";
import React, { useCallback, useEffect, useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ApiError, AuditLogEntry, superAdminApi } from "@/lib/api";
import { formatDateTime } from "@/lib/utils";
import { useTranslation } from "@/hooks/useTranslation";
import { useLatestRequest } from "@/hooks/useAsyncAction";
import { TableRowsSkeleton } from "@/components/ui/skeleton/Skeleton";

export default function SuperAdminAuditLogsPanel() {
  const { t } = useTranslation();
  const [action, setAction] = useState("");
  const [resourceType, setResourceType] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [items, setItems] = useState<AuditLogEntry[]>([]);
  const [cursor, setCursor] = useState<string | undefined>();
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { begin, isLatest } = useLatestRequest();

  const load = useCallback(
    async (nextCursor?: string, append = false) => {
      // Every filter change or "Load more" supersedes the previous request,
      // so a slow older response can never overwrite newer results.
      const token = begin();
      if (append) {
        setLoadingMore(true);
      } else {
        setLoading(true);
        setLoadingMore(false);
        // Old results must not pose as the new filter's results.
        setItems([]);
        setCursor(undefined);
      }
      setError(null);
      try {
        const res = await superAdminApi.auditLogs({
          action: action || undefined,
          resource_type: resourceType || undefined,
          from: from || undefined,
          to: to || undefined,
          limit: nextCursor ? undefined : 25,
          cursor: nextCursor,
        });
        if (!isLatest(token)) return;
        setItems((prev) => (append ? [...prev, ...res.items] : res.items));
        setCursor(res.next_cursor ?? undefined);
      } catch (err) {
        if (!isLatest(token)) return;
        if (!append) setItems([]);
        setError(err instanceof ApiError ? err.message : t("superAdminAuditLogs.failedToLoadAuditLogs"));
      } finally {
        if (isLatest(token)) {
          setLoading(false);
          setLoadingMore(false);
        }
      }
    },
    [action, resourceType, from, to, t, begin, isLatest]
  );

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03] sm:flex-row sm:flex-wrap sm:p-6">
        <input
          value={action}
          onChange={(e) => setAction(e.target.value)}
          placeholder={t("superAdminAuditLogs.actionPlaceholder")}
          className="h-11 sm:w-64 rounded-lg border border-gray-300 bg-transparent px-3 text-sm text-gray-800 focus:border-brand-300 focus:outline-hidden dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
        />
        <input
          value={resourceType}
          onChange={(e) => setResourceType(e.target.value)}
          placeholder={t("superAdminAuditLogs.resourceTypePlaceholder")}
          className="h-11 sm:w-56 rounded-lg border border-gray-300 bg-transparent px-3 text-sm text-gray-800 focus:border-brand-300 focus:outline-hidden dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
        />
        <input
          type="date"
          value={from}
          onChange={(e) => setFrom(e.target.value)}
          className="h-11 rounded-lg border border-gray-300 bg-transparent px-3 text-sm text-gray-800 focus:border-brand-300 focus:outline-hidden dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
        />
        <input
          type="date"
          value={to}
          onChange={(e) => setTo(e.target.value)}
          className="h-11 rounded-lg border border-gray-300 bg-transparent px-3 text-sm text-gray-800 focus:border-brand-300 focus:outline-hidden dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
        />
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]">
        {error && (
          <p className="p-6 text-sm text-error-500">
            {error}
            {items.length === 0 && (
              <button
                type="button"
                onClick={() => load()}
                className="ml-3 font-medium underline hover:no-underline"
              >
                {t("common.retry")}
              </button>
            )}
          </p>
        )}
        {!error && items.length === 0 && !loading && (
          <p className="py-8 text-center text-sm text-gray-500 dark:text-gray-400">
            {t("superAdminAuditLogs.noAuditEntries")}
          </p>
        )}
        {(loading || items.length > 0) && (
          <div className="overflow-x-auto p-4 sm:p-6">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableCell isHeader className="px-4 py-3 text-left text-xs font-semibold uppercase text-gray-500">{t("superAdminAuditLogs.time")}</TableCell>
                  <TableCell isHeader className="px-4 py-3 text-left text-xs font-semibold uppercase text-gray-500">{t("superAdminAuditLogs.actor")}</TableCell>
                  <TableCell isHeader className="px-4 py-3 text-left text-xs font-semibold uppercase text-gray-500">{t("superAdminAuditLogs.action")}</TableCell>
                  <TableCell isHeader className="px-4 py-3 text-left text-xs font-semibold uppercase text-gray-500">{t("superAdminAuditLogs.resource")}</TableCell>
                  <TableCell isHeader className="px-4 py-3 text-left text-xs font-semibold uppercase text-gray-500">{t("superAdminAuditLogs.ip")}</TableCell>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRowsSkeleton rows={5} cols={5} cellClassName="px-4 py-3" />
                ) : items.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell className="px-4 py-3 text-xs whitespace-nowrap text-gray-400">
                      {formatDateTime(log.created_at)}
                    </TableCell>
                    <TableCell className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">
                      {log.actor?.email ?? t("superAdminAuditLogs.system")}
                    </TableCell>
                    <TableCell className="px-4 py-3 text-sm font-medium text-gray-800 dark:text-white/90">
                      {log.action}
                    </TableCell>
                    <TableCell className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">
                      {log.resource_type}
                      <span className="block text-xs text-gray-400">{log.resource_id.slice(0, 8)}…</span>
                    </TableCell>
                    <TableCell className="px-4 py-3 text-xs text-gray-400">
                      {log.ip_address ?? "—"}
                    </TableCell>
                  </TableRow>
                ))}
                {loadingMore && <TableRowsSkeleton rows={3} cols={5} cellClassName="px-4 py-3" />}
              </TableBody>
            </Table>
            {!loading && cursor && (
              <div className="mt-3 text-center">
                <button
                  type="button"
                  onClick={() => load(cursor, true)}
                  disabled={loadingMore}
                  className="text-sm font-medium text-brand-500 hover:underline disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {loadingMore ? t("common.loading") : t("patients.loadMore")}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
