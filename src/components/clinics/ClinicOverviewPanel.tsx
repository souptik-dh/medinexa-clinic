"use client";
import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import toast from "react-hot-toast";
import Badge from "@/components/ui/badge/Badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import RatingStars from "@/components/common/RatingStars";
import ClinicTabs from "@/components/clinics/ClinicTabs";
import ClinicLicensesPanel from "@/components/clinics/ClinicLicensesPanel";
import ConfirmDeleteModal from "@/components/common/ConfirmDeleteModal";
import { Branch, Clinic, ClinicLicenseType, branchesApi, clinicsApi, doctorsApi, labTestsApi } from "@/lib/api";
import { formatDate } from "@/lib/utils";
import { getErrorMessage } from "@/lib/errorMessage";
import { useAuth } from "@/context/AuthContext";
import { canDeleteClinic } from "@/lib/permissions";
import {
  autoCreateBranchForClinic,
  clearAutoBranchPending,
  isAutoBranchPending,
} from "@/lib/autoCreateBranch";

export default function ClinicOverviewPanel() {
  const params = useParams<{ clinicId?: string }>();
  const clinicId = typeof params.clinicId === "string" ? params.clinicId : "";
  const router = useRouter();
  const { user } = useAuth();
  const isAdmin = user?.role === "clinic_owner" || user?.role === "sys_admin";
  const canDelete = isAdmin || canDeleteClinic(user?.role === "branch_staff" ? user.permissions : undefined);

  const [clinic, setClinic] = useState<Clinic | null>(null);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [doctorCount, setDoctorCount] = useState<number | null>(null);
  const [labTestCount, setLabTestCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const load = useCallback(async () => {
    if (!clinicId) return;
    setLoading(true);
    setError(null);
    try {
      const [clinicRes, branchesRes, labTestsRes] = await Promise.all([
        clinicsApi.get(clinicId),
        branchesApi.list(clinicId),
        labTestsApi.list({ clinic_id: clinicId, limit: 100 }),
      ]);
      setClinic(clinicRes);
      setBranches(branchesRes.items);
      setLabTestCount(labTestsRes.items.length);

      // Doctor counts are per-branch (no clinic-level aggregate endpoint), so
      // sum across this clinic's branches. Bounded by branch count, which is
      // small in practice.
      const perBranchCounts = await Promise.all(
        branchesRes.items.map((b) =>
          doctorsApi
            .listByBranch(b.id)
            .then((r) => r.total)
            .catch(() => 0)
        )
      );
      setDoctorCount(perBranchCounts.reduce((sum, n) => sum + n, 0));
    } catch (err) {
      setError(getErrorMessage(err, "Failed to load clinic overview"));
    } finally {
      setLoading(false);
    }
  }, [clinicId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (clinic && !clinic.trade_license_url) {
      toast("Trade license: No document uploaded.", { icon: "⚠️" });
    }
  }, [clinic]);

  // Consumes the "auto-create my first branch" preference set at sign-up: that
  // clinic had no trade license yet then, so the branch couldn't be created until
  // now — once the clinic has one and still has no branches, create it here.
  useEffect(() => {
    if (
      !clinic ||
      loading ||
      branches.length > 0 ||
      !clinic.trade_license_number ||
      !isAutoBranchPending(clinic.id)
    ) {
      return;
    }
    autoCreateBranchForClinic(clinic, user?.phone)
      .then(() => {
        clearAutoBranchPending(clinic.id);
        toast.success("Your first branch was created automatically.");
        load();
      })
      .catch((err) => {
        toast.error(getErrorMessage(err, "Auto-create failed"));
      });
  }, [clinic, branches, loading, user?.phone, load]);

  const LICENSE_URL_FIELD: Record<ClinicLicenseType, keyof Clinic> = {
    "trade-license": "trade_license_url",
    "drug-license": "drug_license_url",
    "clinical-establishment-registration": "clinical_establishment_reg_url",
  };

  const handleLicenseUpdated = (type: ClinicLicenseType, url: string) => {
    const field = LICENSE_URL_FIELD[type];
    setClinic((prev) => (prev ? { ...prev, [field]: url } : prev));
  };

  const confirmDeleteClinic = async () => {
    if (!clinic) return;
    setDeleting(true);
    try {
      await clinicsApi.remove(clinic.id, true);
      toast.success("Clinic deleted successfully.");
      router.replace("/clinics");
    } catch (err) {
      toast.error(getErrorMessage(err, "Unable to delete clinic. Please try again."));
    } finally {
      setDeleting(false);
      setConfirmingDelete(false);
    }
  };

  if (loading) {
    return <p className="py-10 text-center text-sm text-gray-500 dark:text-gray-400">Loading…</p>;
  }
  if (error || !clinic) {
    return (
      <div className="rounded-lg border border-error-500/30 bg-error-50 px-4 py-3 text-sm text-error-600 dark:bg-error-500/10 dark:text-error-400">
        {error ?? "Clinic not found."}
      </div>
    );
  }

  const addressLine = [clinic.city, clinic.district, clinic.state, clinic.pin_code]
    .filter(Boolean)
    .join(", ");

  return (
    <div className="space-y-6">
      <ClinicTabs />
      <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">{clinic.name}</h3>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              {clinic.description || "No description"}
            </p>
            {addressLine && (
              <p className="mt-2 text-theme-xs text-gray-400 dark:text-gray-500">{addressLine}</p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Link
              href={`/clinics/${clinicId}/edit`}
              className="rounded-lg border border-brand-500/40 px-4 py-2 text-sm font-medium text-brand-500 hover:bg-brand-50 dark:hover:bg-brand-500/10"
            >
              Edit clinic
            </Link>
            {canDelete && (
              <button
                onClick={() => setConfirmingDelete(true)}
                disabled={deleting}
                className="rounded-lg border border-error-500/40 px-4 py-2 text-sm font-medium text-error-600 hover:bg-error-50 disabled:opacity-50 dark:hover:bg-error-500/10"
              >
                Delete clinic
              </button>
            )}
            <Link href="/clinics" className="text-sm font-medium text-brand-500 hover:underline">
              View all clinics
            </Link>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Badge color={clinic.trade_license_validated ? "success" : "warning"}>
            Trade license {clinic.trade_license_validated ? "validated" : "pending"}
          </Badge>
          <span className="text-theme-xs text-gray-400 dark:text-gray-500">
            Created {formatDate(clinic.created_at)}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Branches" value={branches.length} />
        <StatCard label="Doctors" value={doctorCount ?? "—"} />
        <StatCard label="Lab Tests" value={labTestCount === 100 ? "100+" : labTestCount ?? "—"} />
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] sm:p-6">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">Branches</h3>
          <Link
            href={`/clinics/${clinicId}/branches/new`}
            className="text-sm font-medium text-brand-500 hover:underline"
          >
            + New branch
          </Link>
        </div>
        {branches.length === 0 ? (
          <p className="py-8 text-center text-sm text-gray-500 dark:text-gray-400">No branches yet.</p>
        ) : (
          <div className="max-w-full overflow-x-auto">
            <Table>
              <TableHeader className="border-gray-100 dark:border-gray-800 border-y">
                <TableRow>
                  <TableCell isHeader className="py-3 font-medium text-gray-500 text-start text-theme-xs dark:text-gray-400">
                    Name
                  </TableCell>
                  <TableCell isHeader className="py-3 font-medium text-gray-500 text-start text-theme-xs dark:text-gray-400">
                    Phone
                  </TableCell>
                  <TableCell isHeader className="py-3 font-medium text-gray-500 text-start text-theme-xs dark:text-gray-400">
                    Rating
                  </TableCell>
                  <TableCell isHeader className="py-3 font-medium text-gray-500 text-end text-theme-xs dark:text-gray-400">
                    Actions
                  </TableCell>
                </TableRow>
              </TableHeader>
              <TableBody className="divide-y divide-gray-100 dark:divide-gray-800">
                {branches.map((b) => (
                  <TableRow key={b.id}>
                    <TableCell className="py-3">
                      <p className="font-medium text-gray-800 text-theme-sm dark:text-white/90">{b.name}</p>
                    </TableCell>
                    <TableCell className="py-3 text-gray-500 text-theme-sm dark:text-gray-400">
                      {b.phone}
                    </TableCell>
                    <TableCell className="py-3">
                      <RatingStars average={b.rating?.average ?? null} count={b.rating?.count ?? 0} size="sm" />
                    </TableCell>
                    <TableCell className="py-3">
                      <div className="flex justify-end gap-1.5">
                        <Link
                          href={`/clinics/${clinicId}/branches/${b.id}/overview`}
                          className="rounded-lg px-2 py-1.5 text-xs font-medium text-brand-500 hover:bg-brand-50 dark:hover:bg-brand-500/10"
                        >
                          Overview
                        </Link>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      {!clinic.trade_license_url && (
        <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] sm:p-6">
          <p className="font-medium text-gray-800 dark:text-white/90">
            Trade license <span className="text-error-500">*</span>
          </p>
          <p className="mt-1 text-sm text-warning-600 dark:text-orange-400">
            ⚠ No document uploaded.
          </p>
        </div>
      )}

      <ClinicLicensesPanel
        clinicId={clinic.id}
        clinicName={clinic.name}
        onLicenseUpdated={handleLicenseUpdated}
      />

      <ConfirmDeleteModal
        isOpen={confirmingDelete}
        onClose={() => setConfirmingDelete(false)}
        onConfirm={confirmDeleteClinic}
        title={`Clinic "${clinic.name}"`}
        description="This clinic and its records will be permanently removed."
        impactItems={[
          "All branches under this clinic",
          "All doctors and staff assigned to those branches",
          "Any active appointments (they'll be cancelled automatically)",
        ]}
        confirmLabel="Delete clinic"
      />
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
      <p className="text-sm text-gray-500 dark:text-gray-400">{label}</p>
      <h4 className="mt-2 text-title-sm font-bold text-gray-800 dark:text-white/90">{value}</h4>
    </div>
  );
}
