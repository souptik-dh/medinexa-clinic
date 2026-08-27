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
import { TableSkeleton } from "@/components/ui/skeleton/Skeleton";
import {
  LabTest,
  LabTestStatus,
  LabTestCategory,
  LabTestCategoryOption,
  labTestsApi,
} from "@/lib/api";
import ClinicTabs from "@/components/clinics/ClinicTabs";
import FormDrawer from "@/components/common/FormDrawer";
import LabTestForm, {
  EMPTY_LAB_TEST_FORM,
} from "@/components/lab-tests/LabTestForm";
import { labTestCategoryLabel } from "@/lib/utils";
import { getErrorMessage } from "@/lib/errorMessage";
import { useTranslation } from "@/hooks/useTranslation";

const STATUS_OPTIONS: (LabTestStatus | "")[] = ["", "active", "inactive"];

export default function LabTestsPanel() {
  const { t } = useTranslation();
  const params = useParams<{ clinicId?: string }>();
  const clinicId = typeof params.clinicId === "string" ? params.clinicId : "";
  const [items, setItems] = useState<LabTest[]>([]);
  const [statusFilter, setStatusFilter] = useState<LabTestStatus | "">("");
  const [categoryFilter, setCategoryFilter] = useState<LabTestCategory | "">("");
  const [categoryOptions, setCategoryOptions] = useState<LabTestCategoryOption[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [editingTest, setEditingTest] = useState<LabTest | null>(null);

  // Category is clinic-defined free text now, so the filter options come from
  // what this clinic has actually used rather than a fixed list.
  useEffect(() => {
    labTestsApi.categories(clinicId).then((res) => setCategoryOptions(res.items)).catch(() => {});
  }, [clinicId]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await labTestsApi.list({
        clinic_id: clinicId,
        status: statusFilter || undefined,
        category: categoryFilter || undefined,
        search: search || undefined,
        limit: 50,
      });
      setItems(res.items);
    } catch (err) {
      setError(getErrorMessage(err, t("labTests.failedToLoad")));
    } finally {
      setLoading(false);
    }
  }, [clinicId, statusFilter, categoryFilter, search, t]);

  useEffect(() => {
    load();
  }, [load]);

  const handleToggleStatus = async (item: LabTest) => {
    setTogglingId(item.id);
    try {
      await labTestsApi.toggleStatus(item.id, item.status === "active" ? "inactive" : "active");
      await load();
      toast.success(t("labTestsPage.statusUpdated"));
    } catch (err) {
      toast.error(getErrorMessage(err, t("labTestsPage.failedToUpdateStatus")));
    } finally {
      setTogglingId(null);
    }
  };

  return (
    <div>
      <ClinicTabs />
      <div className="mb-4 flex flex-col gap-3 rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03] sm:flex-row sm:items-end">
        <FilterField label={t("dashboard.status")}>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as LabTestStatus | "")}
            className="h-11 w-full rounded-lg border border-gray-300 bg-transparent px-3 text-sm text-gray-800 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
          >
            {STATUS_OPTIONS.map((s) => (
              <option key={s || "all"} value={s}>
                {s === "" ? t("appointments.allStatuses") : s === "active" ? t("status.active") : t("status.inactive")}
              </option>
            ))}
          </select>
        </FilterField>
        <FilterField label={t("labTests.category")}>
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value as LabTestCategory | "")}
            className="h-11 w-full rounded-lg border border-gray-300 bg-transparent px-3 text-sm text-gray-800 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
          >
            <option value="">{t("labTestsPage.allCategories")}</option>
            {categoryOptions.map((c) => (
              <option key={c.id ?? c.name} value={c.name}>
                {c.name}
              </option>
            ))}
          </select>
        </FilterField>
        <FilterField label={t("common.search")}>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("labTestsPage.testNamePlaceholder")}
            className="h-11 w-full rounded-lg border border-gray-300 bg-transparent px-3 text-sm text-gray-800 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
          />
        </FilterField>
        <button
          onClick={load}
          className="h-11 rounded-lg border border-gray-300 bg-white px-5 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-white/[0.03]"
        >
          {t("appointments.refresh")}
        </button>
        <button
          onClick={() => setCreateOpen(true)}
          className="flex h-11 items-center rounded-lg bg-brand-500 px-5 text-sm font-medium text-white hover:bg-brand-600"
        >
          {t("labTestsPage.newTest")}
        </button>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-error-500/30 bg-error-50 px-4 py-3 text-sm text-error-600 dark:bg-error-500/10 dark:text-error-400">
          {error}
        </div>
      )}

      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white px-4 pb-4 pt-4 dark:border-gray-800 dark:bg-white/[0.03] sm:px-6">
        {loading ? (
          <TableSkeleton rows={5} cols={5} />
        ) : items.length === 0 ? (
          <p className="py-10 text-center text-sm text-gray-500 dark:text-gray-400">
            {t("labTests.noLabTests")}
          </p>
        ) : (
          <div className="max-w-full overflow-x-auto">
            <Table>
              <TableHeader className="border-gray-100 dark:border-gray-800 border-y">
                <TableRow>
                  <TableCell isHeader className="py-3 font-medium text-gray-500 text-start text-theme-xs dark:text-gray-400">
                    {t("patients.name")}
                  </TableCell>
                  <TableCell isHeader className="py-3 font-medium text-gray-500 text-start text-theme-xs dark:text-gray-400">
                    {t("labTests.category")}
                  </TableCell>
                  <TableCell isHeader className="py-3 font-medium text-gray-500 text-start text-theme-xs dark:text-gray-400">
                    {t("labTestsPage.code")}
                  </TableCell>
                  <TableCell isHeader className="py-3 font-medium text-gray-500 text-start text-theme-xs dark:text-gray-400">
                    {t("dashboard.status")}
                  </TableCell>
                  <TableCell isHeader className="py-3 font-medium text-gray-500 text-end text-theme-xs dark:text-gray-400">
                    {t("appointments.actions")}
                  </TableCell>
                </TableRow>
              </TableHeader>
              <TableBody className="divide-y divide-gray-100 dark:divide-gray-800">
                {items.map((item) => (
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
                        color={item.status === "active" ? "success" : "dark"}
                      >
                        {item.status === "active" ? t("status.active") : t("status.inactive")}
                      </Badge>
                    </TableCell>
                    <TableCell className="py-3">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => setEditingTest(item)}
                          className="rounded-lg px-2 py-1.5 text-xs font-medium text-brand-500 hover:bg-brand-50 dark:hover:bg-brand-500/10"
                        >
                          {t("common.edit")}
                        </button>
                        <button
                          onClick={() => handleToggleStatus(item)}
                          disabled={togglingId === item.id}
                          className={`rounded-lg px-2 py-1.5 text-xs font-medium disabled:opacity-50 ${
                            item.status === "active"
                              ? "text-error-600 hover:bg-error-50 dark:hover:bg-error-500/10"
                              : "text-success-600 hover:bg-success-50 dark:hover:bg-success-500/10"
                          }`}
                        >
                          {item.status === "active" ? t("labTestsPage.deactivate") : t("labTestsPage.activate")}
                        </button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      {/* Add / edit lab test — drawers keep the user on the current page */}
      <FormDrawer
        isOpen={createOpen}
        onClose={() => setCreateOpen(false)}
        title={t("labTests.addLabTest")}
      >
        <LabTestForm
          mode="create"
          initial={EMPTY_LAB_TEST_FORM}
          submitLabel={t("labTestsPage.create")}
          onCancel={() => setCreateOpen(false)}
          onSubmit={async (payload) => {
            try {
              await labTestsApi.create({ ...payload, clinic_id: clinicId });
              toast.success(t("labTestsPage.createdSuccess"));
              setCreateOpen(false);
              await load();
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
            onSubmit={async (payload) => {
              try {
                await labTestsApi.update(editingTest.id, payload);
                toast.success(t("labTestsPage.updatedSuccess"));
                setEditingTest(null);
                await load();
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

function FilterField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="sm:w-48">
      <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-gray-400 dark:text-gray-500">
        {label}
      </label>
      {children}
    </div>
  );
}
