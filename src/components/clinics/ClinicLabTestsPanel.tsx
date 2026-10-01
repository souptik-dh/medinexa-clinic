"use client";
import React, { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import toast from "react-hot-toast";
import Badge from "@/components/ui/badge/Badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Branch,
  LabTest,
  LabTestCategoryOption,
  LabTestStatus,
  branchesApi,
  labTestsApi,
} from "@/lib/api";
import FormDrawer from "@/components/common/FormDrawer";
import LabTestForm, {
  EMPTY_LAB_TEST_FORM,
} from "@/components/lab-tests/LabTestForm";
import { labTestCategoryLabel } from "@/lib/utils";
import { getErrorMessage } from "@/lib/errorMessage";
import { TableRowsSkeleton } from "@/components/ui/skeleton/Skeleton";
import { useKeyedAction, useLatestRequest } from "@/hooks/useAsyncAction";
import { useTranslation } from "@/hooks/useTranslation";

const STATUS_OPTIONS: (LabTestStatus | "")[] = ["", "active", "inactive"];

export default function ClinicLabTestsPanel() {
  const { t } = useTranslation();
  const params = useParams<{ clinicId?: string }>();
  const clinicId = typeof params.clinicId === "string" ? params.clinicId : "";
  const [items, setItems] = useState<LabTest[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [statusFilter, setStatusFilter] = useState<LabTestStatus | "">("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [categoryOptions, setCategoryOptions] = useState<LabTestCategoryOption[]>([]);
  const [categoriesLoading, setCategoriesLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedBranch, setSelectedBranch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Per-row status toggles - one in flight never blocks the other rows.
  const rowAction = useKeyedAction<string>();
  const { begin, isLatest } = useLatestRequest();
  const [createOpen, setCreateOpen] = useState(false);
  const [editingTest, setEditingTest] = useState<LabTest | null>(null);
  // Mirrors the open drawer's LabTestForm save state so it can't be
  // dismissed mid-request (only one drawer is open at a time).
  const [formPending, setFormPending] = useState(false);

  useEffect(() => {
    if (!clinicId) return;
    branchesApi
      .list(clinicId)
      .then((res) => {
        setBranches(res.items);
        if (res.items.length === 1) setSelectedBranch(res.items[0].id);
      })
      .catch(() => {});
  }, [clinicId]);

  useEffect(() => {
    labTestsApi
      .categories(clinicId)
      .then((res) => setCategoryOptions(res.items))
      .catch(() => {})
      .finally(() => setCategoriesLoading(false));
  }, [clinicId]);

  // New filters/search show skeleton rows; `silent` refreshes after a
  // mutation keep the current rows on screen. Stale responses are dropped.
  const load = useCallback(async (opts?: { silent?: boolean }) => {
    const token = begin();
    if (!opts?.silent) {
      setLoading(true);
      // Don't let the previous query's rows pose as this query's results.
      setItems([]);
    }
    setError(null);
    try {
      const res = await labTestsApi.list({
        clinic_id: clinicId,
        status: statusFilter || undefined,
        category: categoryFilter || undefined,
        search: search || undefined,
        limit: 50,
      });
      if (!isLatest(token)) return;
      setItems(res.items);
    } catch (err) {
      if (!isLatest(token)) return;
      setError(getErrorMessage(err, t("labTests.failedToLoad")));
    } finally {
      if (isLatest(token)) setLoading(false);
    }
  }, [clinicId, statusFilter, categoryFilter, search, t, begin, isLatest]);

  useEffect(() => {
    load();
  }, [load]);

  const handleToggleStatus = async (item: LabTest) => {
    await rowAction.run(item.id, async () => {
      try {
        const updated = await labTestsApi.toggleStatus(
          item.id,
          item.status === "active" ? "inactive" : "active"
        );
        // Targeted update from the response; drop the row if it no longer
        // matches the active status filter (as a refetch would).
        setItems((prev) =>
          prev.flatMap((i) => {
            if (i.id !== item.id) return [i];
            const next = { ...i, ...updated };
            return statusFilter && next.status !== statusFilter ? [] : [next];
          })
        );
        toast.success(t("labTestsPage.statusUpdated"));
      } catch (err) {
        toast.error(
          getErrorMessage(err, t("labTestsPage.failedToUpdateStatus"))
        );
      }
    });
  };

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] lg:p-6">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">
            {t("labTests.title")}
          </h3>
          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            className="inline-flex items-center gap-2 rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600"
          >
            <svg
              className="h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 4v16m8-8H4"
              />
            </svg>
            {t("labTests.addLabTest")}
          </button>
        </div>

        {/* Branch Selector */}
        {branches.length > 1 && (
          <div className="mb-4">
            <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-gray-400 dark:text-gray-500">
              {t("labTestsPage.branch")}
            </label>
            <select
              value={selectedBranch}
              onChange={(e) => setSelectedBranch(e.target.value)}
              className="h-10 w-full max-w-xs rounded-lg border border-gray-300 bg-transparent px-3 text-sm text-gray-800 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
            >
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Filters */}
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex-1 sm:max-w-xs">
            <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-gray-400 dark:text-gray-500">
              {t("common.search")}
            </label>
            <div className="relative">
              <svg
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 dark:text-gray-500"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                />
              </svg>
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t("labTestsPage.searchPlaceholder")}
                className="h-10 w-full rounded-lg border border-gray-300 bg-transparent pl-10 pr-4 text-sm text-gray-800 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
              />
            </div>
          </div>
          <div className="sm:w-48">
            <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-gray-400 dark:text-gray-500">
              {t("labTests.category")}
            </label>
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              disabled={categoriesLoading}
              className="h-10 w-full rounded-lg border border-gray-300 bg-transparent px-3 text-sm text-gray-800 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
            >
              <option value="">{t("labTestsPage.allCategories")}</option>
              {categoryOptions.map((c) => (
                <option key={c.id ?? c.name} value={c.name}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div className="sm:w-40">
            <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-gray-400 dark:text-gray-500">
              {t("labTestsPage.status")}
            </label>
            <select
              value={statusFilter}
              onChange={(e) =>
                setStatusFilter(e.target.value as LabTestStatus | "")
              }
              className="h-10 w-full rounded-lg border border-gray-300 bg-transparent px-3 text-sm text-gray-800 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
            >
              {STATUS_OPTIONS.map((s) => (
                <option key={s || "all"} value={s}>
                  {s === ""
                    ? t("labTestsPage.allStatuses")
                    : t(`status.${s}`)}
                </option>
              ))}
            </select>
          </div>
        </div>

        {error && (
          <div className="mb-4 rounded-lg border border-error-500/30 bg-error-50 px-4 py-3 text-sm text-error-600 dark:bg-error-500/10 dark:text-error-400">
            {error}
            <button
              type="button"
              onClick={() => load()}
              disabled={loading}
              className="ml-3 font-medium underline disabled:cursor-not-allowed disabled:opacity-50"
            >
              {t("common.retry")}
            </button>
          </div>
        )}

        <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white px-4 pb-4 pt-4 dark:border-gray-800 dark:bg-white/[0.03] sm:px-6">
          {!loading && items.length === 0 ? (
            <p className="py-10 text-center text-sm text-gray-500 dark:text-gray-400">
              {t("labTests.noLabTests")}
            </p>
          ) : (
            <div className="max-w-full overflow-x-auto">
              <Table>
                <TableHeader className="border-gray-100 dark:border-gray-800 border-y">
                  <TableRow>
                    <TableCell
                      isHeader
                      className="py-3 font-medium text-gray-500 text-start text-theme-xs dark:text-gray-400"
                    >
                      {t("labTests.testName")}
                    </TableCell>
                    <TableCell
                      isHeader
                      className="py-3 font-medium text-gray-500 text-start text-theme-xs dark:text-gray-400"
                    >
                      {t("labTests.category")}
                    </TableCell>
                    <TableCell
                      isHeader
                      className="py-3 font-medium text-gray-500 text-start text-theme-xs dark:text-gray-400"
                    >
                      {t("labTestsPage.code")}
                    </TableCell>
                    <TableCell
                      isHeader
                      className="py-3 font-medium text-gray-500 text-start text-theme-xs dark:text-gray-400"
                    >
                      {t("labTestsPage.status")}
                    </TableCell>
                    <TableCell
                      isHeader
                      className="py-3 font-medium text-gray-500 text-end text-theme-xs dark:text-gray-400"
                    >
                      {t("common.actions")}
                    </TableCell>
                  </TableRow>
                </TableHeader>
                <TableBody className="divide-y divide-gray-100 dark:divide-gray-800">
                  {loading ? (
                    <TableRowsSkeleton rows={5} cols={5} actions cellClassName="py-3" />
                  ) : items.map((item) => {
                    const toggling = rowAction.isPending(item.id);
                    return (
                    <TableRow key={item.id}>
                      <TableCell className="py-3">
                        <p className="font-medium text-gray-800 text-theme-sm dark:text-white/90">
                          {item.name}
                        </p>
                        {item.description && (
                          <p className="text-gray-500 text-theme-xs dark:text-gray-400 truncate max-w-[200px]">
                            {item.description}
                          </p>
                        )}
                      </TableCell>
                      <TableCell className="py-3">
                        <Badge size="sm" color="light">
                          {labTestCategoryLabel(item.category)}
                        </Badge>
                      </TableCell>
                      <TableCell className="py-3 text-gray-500 text-theme-sm dark:text-gray-400">
                        {item.code}
                      </TableCell>
                      <TableCell className="py-3">
                        <Badge
                          size="sm"
                          color={
                            item.status === "active" ? "success" : "dark"
                          }
                        >
                          {item.status === "active"
                            ? t("status.active")
                            : t("status.inactive")}
                        </Badge>
                      </TableCell>
                      <TableCell className="py-3">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => setEditingTest(item)}
                            disabled={toggling}
                            className="rounded-lg px-2 py-1.5 text-xs font-medium text-brand-500 hover:bg-brand-50 disabled:cursor-not-allowed disabled:opacity-50 dark:hover:bg-brand-500/10"
                          >
                            {t("common.edit")}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleToggleStatus(item)}
                            disabled={toggling}
                            className={`rounded-lg px-2 py-1.5 text-xs font-medium disabled:cursor-not-allowed disabled:opacity-50 ${
                              item.status === "active"
                                ? "text-error-600 hover:bg-error-50 dark:hover:bg-error-500/10"
                                : "text-success-600 hover:bg-success-50 dark:hover:bg-success-500/10"
                            }`}
                          >
                            {toggling
                              ? t("common.updatingEllipsis")
                              : item.status === "active"
                                ? t("labTestsPage.deactivate")
                                : t("labTestsPage.activate")}
                          </button>
                        </div>
                      </TableCell>
                    </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      </div>

      {/* Add / edit lab test — drawers keep the user on the Lab Tests tab */}
      <FormDrawer
        isOpen={createOpen}
        onClose={() => setCreateOpen(false)}
        closeDisabled={formPending}
        title={t("labTests.addLabTest")}
      >
        <LabTestForm
          mode="create"
          initial={EMPTY_LAB_TEST_FORM}
          submitLabel={t("labTestsPage.create")}
          onCancel={() => setCreateOpen(false)}
          onPendingChange={setFormPending}
          onSubmit={async (payload) => {
            try {
              await labTestsApi.create({ ...payload, clinic_id: clinicId });
              toast.success(t("labTestsPage.createdSuccess"));
              setCreateOpen(false);
              await load({ silent: true });
            } catch (err) {
              toast.error(getErrorMessage(err, t("labTestsPage.failedToCreate")));
              throw err;
            }
          }}
        />
      </FormDrawer>

      <FormDrawer
        isOpen={editingTest !== null}
        onClose={() => setEditingTest(null)}
        closeDisabled={formPending}
        title={t("labTests.editLabTest")}
        description={editingTest?.name}
      >
        {editingTest && (
          <LabTestForm
            key={editingTest.id}
            mode="edit"
            initial={{
              name: editingTest.name,
              code: editingTest.code,
              description: editingTest.description ?? "",
              category: editingTest.category,
              instructions: editingTest.instructions ?? "",
              default_precautions: (editingTest.default_precautions ?? []).join(", "),
            }}
            submitLabel={t("labTestsPage.update")}
            onCancel={() => setEditingTest(null)}
            onPendingChange={setFormPending}
            onSubmit={async (payload) => {
              try {
                await labTestsApi.update(editingTest.id, payload);
                toast.success(t("labTestsPage.updatedSuccess"));
                setEditingTest(null);
                await load({ silent: true });
              } catch (err) {
                toast.error(getErrorMessage(err, t("labTestsPage.failedToUpdate")));
                throw err;
              }
            }}
          />
        )}
      </FormDrawer>
    </div>
  );
}
