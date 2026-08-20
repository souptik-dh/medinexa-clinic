"use client";
import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { LabTestCategory, labTestsApi } from "@/lib/api";
import { labTestCategoryLabel } from "@/lib/utils";

// Fixed-category legacy values, kept as starting suggestions for a clinic
// with no lab tests yet. Category itself is free text (see labTestsApi.categories()).
const DEFAULT_CATEGORY_SUGGESTIONS = [
  "Blood Test",
  "Cardiology",
  "Diabetes",
  "Urine Test",
  "Imaging",
  "General Diagnostics",
  "Health Check",
  "Other",
];

// Edit keeps the original fixed dropdown rather than the create-mode
// combobox, since existing tests already have a real category worth editing
// directly — these are its options, in their legacy raw (snake_case) form.
const EDIT_CATEGORY_VALUES = [
  "blood_test",
  "cardiology",
  "diabetes",
  "urine_test",
  "imaging",
  "general_diagnostics",
  "health_check",
  "other",
];

export interface LabTestFormValues {
  name: string;
  code: string;
  description: string;
  category: LabTestCategory;
  instructions: string;
  default_precautions: string;
}

export const EMPTY_LAB_TEST_FORM: LabTestFormValues = {
  name: "",
  code: "",
  description: "",
  category: "",
  instructions: "",
  default_precautions: "",
};

interface LabTestFormProps {
  // "create" hides Name/Code (auto-derived from category by the backend) and
  // turns Category into a type-or-pick combobox. "edit" keeps the full
  // Name/Code/Category fields for tests that already have real values.
  mode: "create" | "edit";
  initial: LabTestFormValues;
  submitLabel: string;
  cancelHref: string;
  onSubmit: (payload: {
    name?: string;
    code?: string;
    description: string | null;
    category: LabTestCategory;
    instructions: string | null;
    default_precautions: string[];
  }) => Promise<void>;
}

export default function LabTestForm({ mode, initial, submitLabel, cancelHref, onSubmit }: LabTestFormProps) {
  const router = useRouter();
  const [form, setForm] = useState<LabTestFormValues>(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [categoryOptions, setCategoryOptions] = useState<string[]>(DEFAULT_CATEGORY_SUGGESTIONS);

  useEffect(() => {
    labTestsApi
      .categories()
      .then((res) => {
        if (res.items.length > 0) {
          const names = res.items.map((c) => c.name);
          setCategoryOptions(Array.from(new Set([...names, ...DEFAULT_CATEGORY_SUGGESTIONS])));
        }
      })
      .catch(() => {});
  }, []);

  const updateField = (field: keyof LabTestFormValues, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (mode === "edit") {
      if (!form.name.trim()) {
        setError("Name is required.");
        return;
      }
      if (!form.code.trim()) {
        setError("Code is required.");
        return;
      }
    }
    if (!form.category.trim()) {
      setError("Category is required.");
      return;
    }
    const precautions = form.default_precautions
      .split(",")
      .map((p) => p.trim())
      .filter(Boolean);
    if (precautions.length > 50) {
      setError("You can add at most 50 precautions.");
      return;
    }
    if (precautions.some((p) => p.length > 255)) {
      setError("Each precaution must be 255 characters or fewer.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onSubmit({
        ...(mode === "edit" ? { name: form.name.trim(), code: form.code.trim() } : {}),
        description: form.description.trim() || null,
        category: form.category.trim(),
        instructions: form.instructions.trim() || null,
        default_precautions: precautions,
      });
    } catch {
      setBusy(false);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="max-w-[560px] rounded-2xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-white/[0.03]"
    >
      {error && (
        <div className="mb-4 rounded-lg border border-error-500/30 bg-error-50 px-4 py-3 text-sm text-error-600 dark:bg-error-500/10 dark:text-error-400">
          {error}
        </div>
      )}
      <div className="space-y-4">
        {mode === "edit" && (
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
                Name *
              </label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => updateField("name", e.target.value)}
                maxLength={255}
                className="h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 text-sm text-gray-800 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
                Code *
              </label>
              <input
                type="text"
                value={form.code}
                onChange={(e) => updateField("code", e.target.value)}
                placeholder="e.g. ECG"
                maxLength={50}
                className="h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 text-sm text-gray-800 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
              />
            </div>
          </div>
        )}
        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
            Description
          </label>
          <textarea
            value={form.description}
            onChange={(e) => updateField("description", e.target.value)}
            rows={2}
            maxLength={2000}
            className="w-full rounded-lg border border-gray-300 bg-transparent px-4 py-2.5 text-sm text-gray-800 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
            Category *
          </label>
          {mode === "create" ? (
            <>
              <input
                type="text"
                list="lab-test-category-options"
                value={form.category}
                onChange={(e) => updateField("category", e.target.value)}
                placeholder="Pick a category or type a new one and press Enter"
                maxLength={100}
                className="h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 text-sm text-gray-800 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
              />
              <datalist id="lab-test-category-options">
                {categoryOptions.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
              <p className="mt-1.5 text-xs text-gray-400 dark:text-gray-500">
                Not in the list? Just type the new category name — it&apos;ll be created along with this test.
              </p>
            </>
          ) : (
            <select
              value={form.category}
              onChange={(e) => updateField("category", e.target.value)}
              className="h-11 w-full rounded-lg border border-gray-300 bg-transparent px-3 text-sm text-gray-800 focus:border-brand-300 focus:outline-hidden dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
            >
              {/* Tests created via the category-only flow can carry a value outside
                 this fixed list — keep it selectable so saving doesn't silently
                 overwrite it with the first option. */}
              {!EDIT_CATEGORY_VALUES.includes(form.category) && form.category && (
                <option value={form.category}>{form.category}</option>
              )}
              {EDIT_CATEGORY_VALUES.map((c) => (
                <option key={c} value={c}>
                  {labTestCategoryLabel(c)}
                </option>
              ))}
            </select>
          )}
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
            Instructions
          </label>
          <textarea
            value={form.instructions}
            onChange={(e) => updateField("instructions", e.target.value)}
            rows={2}
            maxLength={2000}
            placeholder="e.g. Fast for 8 hours before the test"
            className="w-full rounded-lg border border-gray-300 bg-transparent px-4 py-2.5 text-sm text-gray-800 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
            Precautions
          </label>
          <input
            type="text"
            value={form.default_precautions}
            onChange={(e) => updateField("default_precautions", e.target.value)}
            placeholder="Comma-separated, e.g. Remove metallic jewelry, Fasting required"
            className="h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 text-sm text-gray-800 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
          />
        </div>
      </div>
      <div className="mt-6 flex items-center justify-end gap-3">
        <button
          type="button"
          onClick={() => router.push(cancelHref)}
          className="rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-white/[0.03]"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={busy}
          className="rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-600 disabled:bg-brand-300"
        >
          {busy ? "Saving..." : submitLabel}
        </button>
      </div>
    </form>
  );
}
