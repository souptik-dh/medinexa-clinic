"use client";
import React, { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import { ApiError, PlatformSetting, superAdminApi } from "@/lib/api";
import { formatDateTime } from "@/lib/utils";

export default function SuperAdminSettingsPanel() {
  const [items, setItems] = useState<PlatformSetting[]>([]);
  const [editableKeys, setEditableKeys] = useState<{ key: string; description: string }[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingKey, setSavingKey] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await superAdminApi.settings();
      setItems(res.items);
      setEditableKeys(res.editable_keys ?? []);
      setDrafts(Object.fromEntries(res.items.map((i) => [i.key, i.value])));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load settings");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const save = async (key: string) => {
    setSavingKey(key);
    try {
      await superAdminApi.updateSetting(key, drafts[key] ?? "");
      toast.success(`Saved "${key}".`);
      load();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to save setting");
    } finally {
      setSavingKey(null);
    }
  };

  if (loading) {
    return <p className="py-8 text-center text-sm text-gray-400">Loading settings…</p>;
  }
  if (error) {
    return (
      <div className="rounded-2xl border border-error-200 bg-error-50 p-6 text-sm text-error-700 dark:border-error-500/20 dark:bg-error-500/10 dark:text-error-400">
        {error}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03] sm:p-6">
        <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">
          Platform settings
        </h3>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Editable keys are validated server-side. Other values are read-only.
        </p>
      </div>

      {items.length === 0 && (
        <p className="py-8 text-center text-sm text-gray-500 dark:text-gray-400">
          No settings configured.
        </p>
      )}

      {items.map((setting) => {
        const isEditable = editableKeys.some((e) => e.key === setting.key);
        const description = editableKeys.find((e) => e.key === setting.key)?.description;
        const dirty = drafts[setting.key] !== setting.value;
        return (
          <div
            key={setting.key}
            className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03] sm:p-6"
          >
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <div className="flex-1">
                <label className="mb-1.5 flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-gray-400">
                  {setting.key}
                  {!isEditable && (
                    <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] normal-case text-gray-500 dark:bg-white/5 dark:text-gray-400">
                      read-only
                    </span>
                  )}
                </label>
                {description && (
                  <p className="mb-2 text-xs text-gray-400">{description}</p>
                )}
                <input
                  value={drafts[setting.key] ?? ""}
                  onChange={(e) =>
                    setDrafts((prev) => ({ ...prev, [setting.key]: e.target.value }))
                  }
                  disabled={!isEditable}
                  className="h-11 w-full rounded-lg border border-gray-300 bg-transparent px-3 text-sm text-gray-800 focus:border-brand-300 focus:outline-hidden disabled:opacity-60 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
                />
              </div>
              {isEditable && (
                <button
                  onClick={() => save(setting.key)}
                  disabled={!dirty || savingKey === setting.key}
                  className="inline-flex h-11 items-center rounded-lg bg-brand-500 px-5 text-sm font-medium text-white transition-colors hover:bg-brand-600 disabled:opacity-60"
                >
                  {savingKey === setting.key ? "Saving…" : "Save"}
                </button>
              )}
            </div>
            {setting.updated_at && (
              <p className="mt-2 text-xs text-gray-400">
                Last updated {formatDateTime(setting.updated_at)}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}
