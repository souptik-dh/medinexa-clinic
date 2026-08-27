"use client";
import React, { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import toast from "react-hot-toast";
import {
  BranchLabTest,
  LabTest,
  branchLabTestsApi,
  labTestsApi,
} from "@/lib/api";
import { labTestCategoryLabel } from "@/lib/utils";
import { getErrorMessage } from "@/lib/errorMessage";
import { DetailSkeleton } from "@/components/ui/skeleton/Skeleton";
import { useTranslation } from "@/hooks/useTranslation";

interface ConfigForm {
  test_id: string;
  price: string;
  currency: string;
  duration_minutes: string;
  clinic_available: boolean;
  home_collection_available: boolean;
  prescription_required: boolean;
}

const EMPTY_CONFIG: ConfigForm = {
  test_id: "",
  price: "",
  currency: "INR",
  duration_minutes: "30",
  clinic_available: true,
  home_collection_available: false,
  prescription_required: false,
};

interface BranchLabTestFormProps {
  editItem?: BranchLabTest;
}

export default function BranchLabTestForm({ editItem }: BranchLabTestFormProps) {
  const { t } = useTranslation();
  const router = useRouter();
  const params = useParams<{ clinicId?: string; branchId?: string }>();
  const clinicId = typeof params.clinicId === "string" ? params.clinicId : "";
  const branchId = typeof params.branchId === "string" ? params.branchId : "";
  const [allTests, setAllTests] = useState<LabTest[]>([]);
  const [configuredTestIds, setConfiguredTestIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [config, setConfig] = useState<ConfigForm>(
    editItem
      ? {
          test_id: editItem.test_id,
          price: String(editItem.price),
          currency: editItem.currency,
          duration_minutes: String(editItem.duration_minutes),
          clinic_available: editItem.clinic_available,
          home_collection_available: editItem.home_collection_available,
          prescription_required: editItem.prescription_required,
        }
      : EMPTY_CONFIG
  );

  const cancelHref = `/clinics/${clinicId}/branches/${branchId}/lab-tests`;

  const loadOptions = useCallback(async () => {
    setLoading(true);
    try {
      const [testsRes, configuredRes] = await Promise.all([
        labTestsApi.list({ clinic_id: clinicId, status: "active", limit: 100 }),
        branchLabTestsApi.list(branchId),
      ]);
      setAllTests(testsRes.items);
      setConfiguredTestIds(new Set(configuredRes.items.map((i) => i.test_id)));
    } catch (err) {
      setError(getErrorMessage(err, t("labTests.failedToLoad")));
    } finally {
      setLoading(false);
    }
  }, [clinicId, branchId, t]);

  useEffect(() => {
    loadOptions();
  }, [loadOptions]);

  const updateField = <K extends keyof ConfigForm>(field: K, value: ConfigForm[K]) => {
    setConfig((prev) => ({ ...prev, [field]: value }));
  };

  const availableTests = editItem
    ? allTests
    : allTests.filter((t) => !configuredTestIds.has(t.id));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editItem && !config.test_id) {
      setError(t("branchLabTestForm.pleaseSelectLabTest"));
      return;
    }
    if (!config.price || Number(config.price) <= 0 || Number(config.price) > 1_000_000) {
      setError(t("branchLabTestForm.invalidPrice"));
      return;
    }
    if (config.currency.trim().length !== 3) {
      setError(t("branchLabTestForm.invalidCurrency"));
      return;
    }
    const duration = config.duration_minutes ? Number(config.duration_minutes) : undefined;
    if (duration !== undefined && (duration < 5 || duration > 240)) {
      setError(t("branchLabTestForm.invalidDuration"));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const payload = {
        price: Number(config.price),
        currency: config.currency,
        duration_minutes: duration,
        clinic_available: config.clinic_available,
        home_collection_available: config.home_collection_available,
        prescription_required: config.prescription_required,
      };
      if (editItem) {
        await branchLabTestsApi.update(branchId, editItem.id, payload);
        toast.success(t("branchLabTestForm.updatedSuccess"));
      } else {
        await branchLabTestsApi.configure(branchId, { ...payload, test_id: config.test_id });
        toast.success(t("branchLabTestForm.configuredSuccess"));
      }
      router.push(cancelHref);
    } catch (err) {
      const msg = getErrorMessage(err, t("branchLabTestForm.failedToSave"));
      setError(msg);
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-[500px] rounded-2xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-white/[0.03]">
        <DetailSkeleton rows={5} />
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="max-w-[500px] rounded-2xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-white/[0.03]"
    >
      {error && (
        <div className="mb-4 rounded-lg border border-error-500/30 bg-error-50 px-4 py-3 text-sm text-error-600 dark:bg-error-500/10 dark:text-error-400">
          {error}
        </div>
      )}
      <div className="space-y-4">
        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
            {t("branchLabTestForm.labTestLabel")}
          </label>
          <select
            value={config.test_id}
            onChange={(e) => updateField("test_id", e.target.value)}
            disabled={!!editItem}
            className="h-11 w-full rounded-lg border border-gray-300 bg-transparent px-3 text-sm text-gray-800 focus:border-brand-300 focus:outline-hidden dark:border-gray-700 dark:bg-gray-900 dark:text-white/90 disabled:opacity-50"
          >
            <option value="">{t("branchLabTestForm.selectATest")}</option>
            {availableTests.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} ({labTestCategoryLabel(t.category)})
              </option>
            ))}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
              {t("branchLabTestForm.price")}
            </label>
            <input
              type="number"
              value={config.price}
              onChange={(e) => updateField("price", e.target.value)}
              min={0.01}
              max={1_000_000}
              step="0.01"
              className="h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 text-sm text-gray-800 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
              {t("branchLabTestForm.currency")}
            </label>
            <input
              type="text"
              value={config.currency}
              onChange={(e) => updateField("currency", e.target.value.toUpperCase())}
              maxLength={3}
              className="h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 text-sm text-gray-800 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
            />
          </div>
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
            {t("branchLabTestForm.duration")}
          </label>
          <input
            type="number"
            value={config.duration_minutes}
            onChange={(e) => updateField("duration_minutes", e.target.value)}
            placeholder="30"
            min={5}
            max={240}
            className="h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 text-sm text-gray-800 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
          />
        </div>
        <div className="flex flex-col gap-2">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={config.clinic_available}
              onChange={(e) => updateField("clinic_available", e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-brand-500 focus:ring-brand-500/10"
            />
            <span className="text-sm text-gray-700 dark:text-gray-400">{t("branchLabTestForm.availableAtClinic")}</span>
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={config.home_collection_available}
              onChange={(e) => updateField("home_collection_available", e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-brand-500 focus:ring-brand-500/10"
            />
            <span className="text-sm text-gray-700 dark:text-gray-400">{t("branchLabTestForm.homeCollectionAvailable")}</span>
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={config.prescription_required}
              onChange={(e) => updateField("prescription_required", e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-brand-500 focus:ring-brand-500/10"
            />
            <span className="text-sm text-gray-700 dark:text-gray-400">{t("branchLabTestForm.prescriptionRequired")}</span>
          </label>
        </div>
      </div>
      <div className="mt-6 flex items-center justify-end gap-3">
        <button
          type="button"
          onClick={() => router.push(cancelHref)}
          className="rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-white/[0.03]"
        >
          {t("common.cancel")}
        </button>
        <button
          type="submit"
          disabled={busy}
          className="rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-600 disabled:bg-brand-300"
        >
          {busy ? t("auth.saving") : editItem ? t("labTestsPage.update") : t("branchLabTestForm.configure")}
        </button>
      </div>
    </form>
  );
}
