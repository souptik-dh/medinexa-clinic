"use client";
import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ApiError, Notification, notificationsApi } from "@/lib/api";
import { notificationLink, notificationTypeLabel, timeAgo } from "@/lib/utils";
import { ListSkeleton } from "@/components/ui/skeleton/Skeleton";
import { useTranslation } from "@/hooks/useTranslation";
import { useAsyncAction, useKeyedAction, useLatestRequest } from "@/hooks/useAsyncAction";

export default function NotificationsPanel() {
  const { t } = useTranslation();
  const [items, setItems] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const { pending: markingAll, run: runMarkAll } = useAsyncAction();
  // Per-notification lock so a double click can't fire markRead twice.
  const readAction = useKeyedAction<string>();
  // Shared by the first-page load and "load more": toggling the unread filter
  // drops any in-flight response for the previous filter.
  const { begin, isLatest } = useLatestRequest();
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (unread: boolean) => {
    const token = begin();
    setLoading(true);
    setLoadingMore(false);
    setError(null);
    try {
      const res = await notificationsApi.list({ unread_only: unread, limit: 20 });
      if (!isLatest(token)) return;
      setItems(res.items);
      setUnreadCount(res.unread_count);
      setNextCursor(res.next_cursor);
    } catch (err) {
      if (!isLatest(token)) return;
      setError(err instanceof ApiError ? err.message : "Failed to load notifications");
    } finally {
      if (isLatest(token)) setLoading(false);
    }
  }, [begin, isLatest]);

  useEffect(() => {
    load(unreadOnly);
  }, [load, unreadOnly]);

  const loadMore = async () => {
    if (!nextCursor || loading || loadingMore) return;
    const token = begin();
    setLoadingMore(true);
    setError(null);
    try {
      const res = await notificationsApi.list({
        unread_only: unreadOnly,
        limit: 20,
        cursor: nextCursor,
      });
      if (!isLatest(token)) return;
      setItems((prev) => [...prev, ...res.items]);
      setUnreadCount(res.unread_count);
      setNextCursor(res.next_cursor);
    } catch (err) {
      if (!isLatest(token)) return;
      setError(err instanceof ApiError ? err.message : "Failed to load more notifications");
    } finally {
      if (isLatest(token)) setLoadingMore(false);
    }
  };

  const markRead = async (id: string) => {
    const target = items.find((n) => n.id === id);
    if (!target || target.read_at) return;
    await readAction.run(id, async () => {
      try {
        await notificationsApi.markRead(id);
        const now = new Date().toISOString();
        setItems((prev) => prev.map((n) => (n.id === id ? { ...n, read_at: now } : n)));
        setUnreadCount((prev) => Math.max(0, prev - 1));
      } catch {
        // ignore read failures
      }
    });
  };

  const markAllRead = async () => {
    if (unreadCount === 0) return;
    await runMarkAll(async () => {
      try {
        await notificationsApi.markAllRead();
        const now = new Date().toISOString();
        setItems((prev) => prev.map((n) => (n.read_at ? n : { ...n, read_at: now })));
        setUnreadCount(0);
      } catch (err) {
        setError(err instanceof ApiError ? err.message : "Failed to mark all as read");
      }
    });
  };

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] lg:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">
            {t("notifications.title")}
            {unreadCount > 0 && (
              <span className="ml-2 rounded-full bg-brand-500/15 px-2 py-0.5 text-xs font-medium text-brand-500">
                {unreadCount} {t("notifications.unread")}
              </span>
            )}
          </h3>
        </div>
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
            <input
              type="checkbox"
              checked={unreadOnly}
              onChange={(e) => setUnreadOnly(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-brand-500 focus:ring-brand-500"
            />
            {t("notifications.unreadOnly")}
          </label>
          <button
            type="button"
            onClick={markAllRead}
            disabled={markingAll || unreadCount === 0}
            className="text-sm font-medium text-brand-500 hover:text-brand-600 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {markingAll ? t("common.updatingEllipsis") : t("notifications.markAllRead")}
          </button>
        </div>
      </div>

      {error && (
        <div className="mt-4 rounded-lg border border-error-500/30 bg-error-50 px-4 py-3 text-sm text-error-600 dark:bg-error-500/10 dark:text-error-400">
          {error}
          {!loading && items.length === 0 && (
            <button
              type="button"
              onClick={() => load(unreadOnly)}
              className="ml-3 font-medium underline hover:no-underline"
            >
              {t("common.retry")}
            </button>
          )}
        </div>
      )}

      <div className="mt-5">
        {loading ? (
          <ListSkeleton rows={6} />
        ) : items.length === 0 ? (
          <p className="py-10 text-center text-sm text-gray-500 dark:text-gray-400">
            {unreadOnly ? t("notifications.noUnreadNotifications") : t("notifications.noNotificationsYet")}
          </p>
        ) : (
          <ul className="divide-y divide-gray-100 dark:divide-gray-800">
            {items.map((item) => (
              <li key={item.id}>
                <Link
                  href={notificationLink(item.type)}
                  onClick={() => markRead(item.id)}
                  className={`flex items-center justify-between gap-3 rounded-lg px-3 py-3 hover:bg-gray-50 dark:hover:bg-white/5 ${
                    !item.read_at ? "bg-brand-50 dark:bg-brand-500/10" : ""
                  }`}
                >
                  <span>
                    <span className="block text-sm font-medium text-gray-800 dark:text-white/90">
                      {notificationTypeLabel(item.type, t)}
                    </span>
                    <span className="mt-0.5 block text-xs text-gray-500 dark:text-gray-400">
                      {timeAgo(item.created_at)}
                    </span>
                  </span>
                  {!item.read_at && (
                    <span className="h-2 w-2 shrink-0 rounded-full bg-brand-500" />
                  )}
                </Link>
              </li>
            ))}
          </ul>
        )}

        {/* Existing rows stay put; placeholders are appended while the next page loads. */}
        {!loading && loadingMore && <ListSkeleton rows={2} className="mt-2 space-y-2" />}

        {!loading && nextCursor && (
          <div className="mt-4 flex justify-center">
            <button
              type="button"
              onClick={loadMore}
              disabled={loadingMore}
              className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-white/[0.03]"
            >
              {loadingMore ? `${t("common.loading")}` : t("patients.loadMore")}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
