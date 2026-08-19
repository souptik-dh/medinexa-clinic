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
import ClinicTabs from "@/components/clinics/ClinicTabs";
import ClinicLicensesPanel from "@/components/clinics/ClinicLicensesPanel";
import ConfirmDeleteModal from "@/components/common/ConfirmDeleteModal";
import {
  Appointment,
  Branch,
  Clinic,
  ClinicLicenseType,
  appointmentsApi,
  branchesApi,
  clinicsApi,
  doctorsApi,
  labTestsApi,
  patientsApi,
} from "@/lib/api";
import {
  appointmentStatusColor,
  appointmentStatusLabel,
  formatDate,
} from "@/lib/utils";
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
  const isAdmin =
    user?.role === "clinic_owner" || user?.role === "sys_admin";
  const canDelete =
    isAdmin ||
    canDeleteClinic(
      user?.role === "branch_staff" ? user.permissions : undefined
    );

  const [clinic, setClinic] = useState<Clinic | null>(null);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [doctorCount, setDoctorCount] = useState<number | null>(null);
  const [patientCount, setPatientCount] = useState<number | null>(null);
  const [labTestCount, setLabTestCount] = useState<number | null>(null);
  const [recentAppointments, setRecentAppointments] = useState<Appointment[]>(
    []
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const load = useCallback(async () => {
    if (!clinicId) return;
    setLoading(true);
    setError(null);
    try {
      const [clinicRes, branchesRes, labTestsRes, appointmentsRes] =
        await Promise.all([
          clinicsApi.get(clinicId),
          branchesApi.list(clinicId),
          labTestsApi.list({ clinic_id: clinicId, limit: 100 }),
          appointmentsApi.list({ clinic_id: clinicId, limit: 5 }),
        ]);
      setClinic(clinicRes);
      setBranches(branchesRes.items);
      setLabTestCount(labTestsRes.items.length);
      setRecentAppointments(appointmentsRes.items);

      const perBranchCounts = await Promise.all(
        branchesRes.items.map((b) =>
          doctorsApi
            .listByBranch(b.id)
            .then((r) => r.total)
            .catch(() => 0)
        )
      );
      setDoctorCount(perBranchCounts.reduce((sum, n) => sum + n, 0));

      // Patient counts are per-branch; approximate total from first page
      const perBranchPatients = await Promise.all(
        branchesRes.items.map((b) =>
          patientsApi
            .listByBranch(b.id, { limit: 100 })
            .then((r) => r.items.length)
            .catch(() => 0)
        )
      );
      setPatientCount(perBranchPatients.reduce((sum, n) => sum + n, 0));
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
      toast.error(
        getErrorMessage(err, "Unable to delete clinic. Please try again.")
      );
    } finally {
      setDeleting(false);
      setConfirmingDelete(false);
    }
  };

  if (loading) {
    return (
      <p className="py-10 text-center text-sm text-gray-500 dark:text-gray-400">
        Loading…
      </p>
    );
  }
  if (error || !clinic) {
    return (
      <div className="rounded-lg border border-error-500/30 bg-error-50 px-4 py-3 text-sm text-error-600 dark:bg-error-500/10 dark:text-error-400">
        {error ?? "Clinic not found."}
      </div>
    );
  }

  const addressLine = [
    clinic.city,
    clinic.district,
    clinic.state,
    clinic.pin_code,
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <div className="space-y-6">
      <ClinicTabs />

      {/* Clinic Header */}
      <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600 dark:bg-brand-500/10 dark:text-brand-400">
              <svg
                className="h-6 w-6"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.5}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75M6.75 21v-3.375c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21M3 3h12m-.75 4.5H21m-3.75 3H21m-3.75 3H21"
                />
              </svg>
            </div>
            <div>
              <div className="flex items-center gap-3">
                <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">
                  {clinic.name}
                </h3>
                <span
                  className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${
                    clinic.trade_license_validated
                      ? "bg-success-50 text-success-700 dark:bg-success-500/10 dark:text-success-400"
                      : "bg-warning-50 text-warning-700 dark:bg-orange-500/10 dark:text-orange-400"
                  }`}
                >
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${
                      clinic.trade_license_validated
                        ? "bg-success-500"
                        : "bg-warning-500"
                    }`}
                  />
                  {clinic.trade_license_validated ? "Active" : "Pending"}
                </span>
              </div>
              {addressLine && (
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                  {addressLine}
                </p>
              )}
              <p className="mt-0.5 text-theme-xs text-gray-400 dark:text-gray-500">
                Created {formatDate(clinic.created_at)}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href={`/clinics/${clinicId}/edit`}
              className="rounded-lg border border-brand-500/40 px-4 py-2 text-sm font-medium text-brand-500 hover:bg-brand-50 dark:hover:bg-brand-500/10"
            >
              Edit
            </Link>
            {canDelete && (
              <button
                onClick={() => setConfirmingDelete(true)}
                disabled={deleting}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-white/[0.03]"
              >
                •••
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          label="Branches"
          value={branches.length}
          icon={
            <svg
              className="h-5 w-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M13.5 21v-7.5a.75.75 0 01.75-.75h3a.75.75 0 01.75.75V21m-4.5 0H2.36m11.14 0H18m0 0h3.64m-1.39 0V9.349m-16.5 11.65V9.35m0 0a3.001 3.001 0 003.75-.615A2.993 2.993 0 009.75 9.75c.896 0 1.7-.393 2.25-1.016a2.993 2.993 0 002.25 1.016c.896 0 1.7-.393 2.25-1.016A3.001 3.001 0 0021 9.349m-18 0V6.375a3 3 0 013-3h12a3 3 0 013 3v3"
              />
            </svg>
          }
        />
        <StatCard
          label="Doctors"
          value={doctorCount ?? "—"}
          icon={
            <svg
              className="h-5 w-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z"
              />
            </svg>
          }
        />
        <StatCard
          label="Patients"
          value={patientCount === null ? "—" : patientCount.toLocaleString()}
          icon={
            <svg
              className="h-5 w-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z"
              />
            </svg>
          }
        />
        <StatCard
          label="Lab Tests"
          value={
            labTestCount === null
              ? "—"
              : labTestCount === 100
                ? "100+"
                : labTestCount
          }
          icon={
            <svg
              className="h-5 w-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3M14.25 3.104c.251.023.501.05.75.082M19.8 15.3l-1.57.393A9.065 9.065 0 0112 15a9.065 9.065 0 00-6.23.693L5 14.5m14.8.8l1.402 1.402c1.232 1.232.65 3.318-1.067 3.611A48.309 48.309 0 0112 21c-2.773 0-5.491-.235-8.135-.687-1.718-.293-2.3-2.379-1.067-3.61L5 14.5"
              />
            </svg>
          }
        />
      </div>

      {/* Recent Appointments */}
      <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] sm:p-6">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">
            Recent Appointments
          </h3>
          <Link
            href="/appointments"
            className="text-sm font-medium text-brand-500 hover:underline"
          >
            View all →
          </Link>
        </div>
        {recentAppointments.length === 0 ? (
          <p className="py-8 text-center text-sm text-gray-500 dark:text-gray-400">
            No appointments yet.
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
                    Patient
                  </TableCell>
                  <TableCell
                    isHeader
                    className="py-3 font-medium text-gray-500 text-start text-theme-xs dark:text-gray-400"
                  >
                    Doctor
                  </TableCell>
                  <TableCell
                    isHeader
                    className="py-3 font-medium text-gray-500 text-start text-theme-xs dark:text-gray-400"
                  >
                    Branch
                  </TableCell>
                  <TableCell
                    isHeader
                    className="py-3 font-medium text-gray-500 text-start text-theme-xs dark:text-gray-400"
                  >
                    Date
                  </TableCell>
                  <TableCell
                    isHeader
                    className="py-3 font-medium text-gray-500 text-start text-theme-xs dark:text-gray-400"
                  >
                    Status
                  </TableCell>
                </TableRow>
              </TableHeader>
              <TableBody className="divide-y divide-gray-100 dark:divide-gray-800">
                {recentAppointments.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell className="py-3">
                      <p className="font-medium text-gray-800 text-theme-sm dark:text-white/90">
                        {a.patient_details?.name ?? "—"}
                      </p>
                    </TableCell>
                    <TableCell className="py-3 text-gray-500 text-theme-sm dark:text-gray-400">
                      {a.doctor_name ?? "—"}
                    </TableCell>
                    <TableCell className="py-3 text-gray-500 text-theme-sm dark:text-gray-400">
                      {a.branch_name ?? "—"}
                    </TableCell>
                    <TableCell className="py-3 text-gray-500 text-theme-sm dark:text-gray-400">
                      {a.scheduled_date}
                    </TableCell>
                    <TableCell className="py-3">
                      <Badge
                        size="sm"
                        color={appointmentStatusColor(a.status)}
                      >
                        {appointmentStatusLabel(a.status)}
                      </Badge>
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
            Trade license{" "}
            <span className="text-error-500">*</span>
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

function StatCard({
  label,
  value,
  icon,
}: {
  label: string;
  value: number | string;
  icon: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500 dark:text-gray-400">{label}</p>
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-50 text-brand-500 dark:bg-brand-500/10 dark:text-brand-400">
          {icon}
        </div>
      </div>
      <h4 className="mt-2 text-title-sm font-bold text-gray-800 dark:text-white/90">
        {value}
      </h4>
    </div>
  );
}
