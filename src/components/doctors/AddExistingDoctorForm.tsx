"use client";
import React, { useEffect, useState } from "react";
import Image from "next/image";
import toast from "react-hot-toast";
import BranchSelect, { BranchSelectValue } from "@/components/branches/BranchSelect";
import SlotWeekEditor from "@/components/doctors/SlotWeekEditor";
import SpecializationPicker, {
  SpecializationValue,
} from "@/components/doctors/SpecializationPicker";
import { validateSlotTemplates } from "@/components/doctors/InviteDoctorForm";
import { SlotTypeOption } from "@/components/doctors/scheduleShared";
import { useRouter } from "next/navigation";
import {
  BranchOperatingDay,
  ClinicDoctorSummary,
  SlotTemplateItem,
  SlotType,
  branchScheduleApi,
  doctorInvitesApi,
  doctorsApi,
} from "@/lib/api";
import { REQUIRED_FIELD_MESSAGE, useRequiredFields } from "@/hooks/useRequiredFields";
import FieldError from "@/components/form/FieldError";
import { getInputClass } from "@/components/form/fieldStyles";
import { getErrorMessage } from "@/lib/errorMessage";
import { useAuth } from "@/context/AuthContext";
import { useTranslation } from "@/hooks/useTranslation";
import { useAsyncAction } from "@/hooks/useAsyncAction";
import { ListSkeleton } from "@/components/ui/skeleton/Skeleton";

type RequiredField =
  | "branch"
  | "doctor"
  | "feeAmount"
  | "currency"
  | "specializations"
  | "slots";

const initials = (name: string): string =>
  name
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

interface AddExistingDoctorFormProps {
  /** When provided, the form is embedded (e.g. inside a drawer): success and
   * cancel hand control back to the host instead of navigating away. */
  onDone?: () => void;
  onCancel?: () => void;
  /** Reports when the submit is in flight, so a host drawer can block closing. */
  onPendingChange?: (pending: boolean) => void;
}

export default function AddExistingDoctorForm({
  onDone,
  onCancel,
  onPendingChange,
}: AddExistingDoctorFormProps = {}) {
  const router = useRouter();
  const { can } = useAuth();
  const canManage = can("doctors:manage");
  const { t } = useTranslation();

  const [branch, setBranch] = useState<BranchSelectValue | null>(null);
  const [roster, setRoster] = useState<ClinicDoctorSummary[]>([]);
  const [rosterLoading, setRosterLoading] = useState(false);
  const [rosterError, setRosterError] = useState<string | null>(null);
  // Bumped by Retry to re-run the roster load for the same branch.
  const [rosterReloadKey, setRosterReloadKey] = useState(0);
  const [selectedDoctor, setSelectedDoctor] = useState<ClinicDoctorSummary | null>(null);
  const [doctorSearch, setDoctorSearch] = useState("");

  const [specializations, setSpecializations] = useState<SpecializationValue[]>([]);
  const [feeAmount, setFeeAmount] = useState("");
  const [currency, setCurrency] = useState("INR");
  const [slotType, setSlotType] = useState<SlotType>("fixed");
  const [slots, setSlots] = useState<SlotTemplateItem[]>([]);
  const [operatingDays, setOperatingDays] = useState<BranchOperatingDay[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { pending: isSubmitting, run: runSubmit } = useAsyncAction();
  const { touch, showError, setSubmitted } = useRequiredFields<RequiredField>();

  useEffect(() => {
    onPendingChange?.(isSubmitting);
  }, [isSubmitting, onPendingChange]);
  // The host may unmount the form from onDone while the request is still
  // settling - make sure it never keeps a stale "pending" flag.
  useEffect(
    () => () => onPendingChange?.(false),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  useEffect(() => {
    if (!branch) {
      setOperatingDays(null);
      return;
    }
    // Ignore a slower response for a previously selected branch.
    let active = true;
    branchScheduleApi
      .get(branch.id)
      .then((res) => {
        if (active) setOperatingDays(res.operating_days);
      })
      .catch(() => {
        if (active) setOperatingDays(null);
      });
    return () => {
      active = false;
    };
  }, [branch]);

  useEffect(() => {
    setSelectedDoctor(null);
    setSpecializations([]);
    setRoster([]);
    if (!branch) {
      setRosterError(null);
      return;
    }
    let active = true;
    setRosterLoading(true);
    setRosterError(null);
    doctorsApi
      .listByClinic(branch.clinic_id, { excludeBranchId: branch.id })
      .then((res) => {
        if (active) setRoster(res.items);
      })
      .catch((err) => {
        if (active) setRosterError(getErrorMessage(err, t("doctors.failedToLoad")));
      })
      .finally(() => {
        if (active) setRosterLoading(false);
      });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branch, rosterReloadKey]);

  const filteredRoster = roster.filter((d) => {
    if (!doctorSearch.trim()) return true;
    const q = doctorSearch.toLowerCase();
    return (
      d.name.toLowerCase().includes(q) || (d.specialization ?? "").toLowerCase().includes(q)
    );
  });

  const selectDoctor = (doctor: ClinicDoctorSummary) => {
    setSelectedDoctor(doctor);
    setSpecializations(doctor.specializations);
    // Prefill fee/currency/booking type from wherever else they already
    // work in this clinic — same-clinic branches usually share pricing and
    // booking style, so this is a sensible starting point, still editable.
    const existing = doctor.branches[0];
    if (existing) {
      setFeeAmount(String(existing.fee_amount));
      setCurrency(existing.currency);
      setSlotType(existing.slot_type);
    }
    touch("doctor");
  };

  const addToBranch = async () => {
    if (!canManage) {
      toast.error(t("appointments.noPermission"));
      return;
    }
    setSubmitted(true);
    const amount = Number(feeAmount);
    if (
      !branch ||
      !selectedDoctor ||
      !feeAmount.trim() ||
      !amount ||
      amount <= 0 ||
      !currency.trim() ||
      specializations.length === 0
    ) {
      setError(t("auth.pleaseFillRequired"));
      return;
    }
    const slotError = validateSlotTemplates(slots);
    if (slotError) {
      setError(slotError);
      return;
    }
    await runSubmit(async () => {
      setError(null);
      try {
        await doctorInvitesApi.create(branch.id, {
          doctor_id: selectedDoctor.id,
          specialization_ids: specializations.map((s) => s.id),
          fee_amount: amount,
          currency,
          slot_type: slotType,
          slot_template: slots,
        });
        toast.success(t("doctors.doctorAddedSuccess"));
        if (onDone) {
          onDone();
        } else {
          router.push("/doctors");
        }
      } catch (err) {
        // Form fields are kept so the user can correct and retry.
        const message = getErrorMessage(err, t("doctors.unableToAddDoctor"));
        setError(message);
        toast.error(message);
      }
    });
  };

  if (!canManage) {
    return (
      <div className="rounded-2xl border border-gray-200 bg-white p-6 text-sm text-gray-500 dark:border-gray-800 dark:bg-white/[0.03] dark:text-gray-400">
        {t("doctors.noPermissionAdd")}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-4 rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03] sm:p-6">
        <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">
          {t("doctors.addExistingDoctorHeading")}
        </h3>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          {t("doctors.addExistingDoctorIntro")}
        </p>
        <BranchSelect
          value={branch?.id ?? ""}
          onChange={setBranch}
          onBlur={() => touch("branch")}
          error={showError("branch", !branch)}
          hint={showError("branch", !branch) ? REQUIRED_FIELD_MESSAGE : undefined}
        />
      </div>

      {error && (
        <div className="rounded-lg border border-error-500/30 bg-error-50 px-4 py-3 text-sm text-error-600 dark:bg-error-500/10 dark:text-error-400">
          {error}
        </div>
      )}

      {branch && (
        <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03] sm:p-6">
          <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
            {t("appointments.doctor")} *
          </label>
          {rosterError && (
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <p className="text-sm text-error-600 dark:text-error-400">{rosterError}</p>
              {!rosterLoading && (
                <button
                  type="button"
                  onClick={() => setRosterReloadKey((k) => k + 1)}
                  className="rounded-lg px-2 py-1 text-xs font-medium text-error-600 underline hover:bg-error-50 dark:text-error-400 dark:hover:bg-error-500/10"
                >
                  {t("common.retry")}
                </button>
              )}
            </div>
          )}
          {rosterLoading ? (
            <ListSkeleton rows={3} />
          ) : rosterError ? null : roster.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {t("doctors.noOtherDoctorsAtClinic", { inviteDoctor: t("doctors.inviteDoctor") })}
            </p>
          ) : (
            <>
              <input
                type="text"
                value={doctorSearch}
                onChange={(e) => setDoctorSearch(e.target.value)}
                placeholder={t("doctors.searchDoctorByNameOrSpec")}
                className={getInputClass(false)}
              />
              <div
                className={`mt-3 max-h-64 overflow-y-auto rounded-lg border ${
                  showError("doctor", !selectedDoctor)
                    ? "border-error-500"
                    : "border-gray-200 dark:border-gray-800"
                }`}
              >
                {filteredRoster.length === 0 ? (
                  <p className="p-4 text-sm text-gray-500 dark:text-gray-400">
                    {t("doctors.noDoctorsMatchSearch")}
                  </p>
                ) : (
                  filteredRoster.map((doctor) => (
                    <button
                      type="button"
                      key={doctor.id}
                      onClick={() => selectDoctor(doctor)}
                      className={`flex w-full items-center gap-3 border-b border-gray-100 px-4 py-3 text-left last:border-b-0 hover:bg-gray-50 dark:border-gray-800 dark:hover:bg-white/[0.03] ${
                        selectedDoctor?.id === doctor.id ? "bg-brand-50 dark:bg-brand-500/10" : ""
                      }`}
                    >
                      {doctor.photo_url ? (
                        <Image
                          src={doctor.photo_url}
                          alt={`${doctor.name} photo`}
                          width={36}
                          height={36}
                          unoptimized
                          className="h-9 w-9 shrink-0 rounded-full border border-gray-200 object-cover dark:border-gray-800"
                        />
                      ) : (
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-500 text-xs font-semibold text-white">
                          {initials(doctor.name)}
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-gray-800 dark:text-white/90">
                          {doctor.name}
                        </p>
                        <p className="truncate text-theme-xs text-gray-500 dark:text-gray-400">
                          {doctor.specialization ?? "—"} ·{" "}
                          {t("doctors.alreadyAtBranches", {
                            branches:
                              doctor.branches.map((b) => b.branch_name).join(", ") ||
                              t("doctors.thisClinic"),
                          })}
                        </p>
                      </div>
                      {selectedDoctor?.id === doctor.id && (
                        <span className="shrink-0 text-xs font-medium text-brand-500">
                          {t("doctors.selected")}
                        </span>
                      )}
                    </button>
                  ))
                )}
              </div>
              {showError("doctor", !selectedDoctor) && (
                <FieldError message={REQUIRED_FIELD_MESSAGE} />
              )}
            </>
          )}
        </div>
      )}

      {selectedDoctor && (
        <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03] sm:p-6">
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label={t("doctors.feeAmountRequired")}>
                <input
                  type="number"
                  min="0"
                  value={feeAmount}
                  onChange={(e) => setFeeAmount(e.target.value)}
                  onBlur={() => touch("feeAmount")}
                  className={getInputClass(
                    showError("feeAmount", !feeAmount.trim() || Number(feeAmount) <= 0)
                  )}
                />
                {showError("feeAmount", !feeAmount.trim() || Number(feeAmount) <= 0) && (
                  <FieldError message={REQUIRED_FIELD_MESSAGE} />
                )}
              </Field>
              <Field label={t("doctors.currencyRequired")}>
                <input
                  type="text"
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value)}
                  onBlur={() => touch("currency")}
                  className={getInputClass(showError("currency", !currency.trim()))}
                />
                {showError("currency", !currency.trim()) && (
                  <FieldError message={REQUIRED_FIELD_MESSAGE} />
                )}
              </Field>
            </div>
            <Field label={t("doctors.specializationRequired")}>
              <SpecializationPicker
                value={specializations}
                onChange={setSpecializations}
                onBlur={() => touch("specializations")}
                disabled={isSubmitting}
                error={showError("specializations", specializations.length === 0)}
                hint={
                  showError("specializations", specializations.length === 0)
                    ? REQUIRED_FIELD_MESSAGE
                    : undefined
                }
              />
            </Field>

            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-400">
                {t("doctors.bookingTypeRequired")}
              </label>
              <div className="flex gap-3">
                <SlotTypeOption
                  label={t("doctors.fixed")}
                  description={t("doctors.fixedDesc")}
                  selected={slotType === "fixed"}
                  onClick={() => setSlotType("fixed")}
                />
                <SlotTypeOption
                  label={t("doctors.sequential")}
                  description={t("doctors.sequentialDesc")}
                  selected={slotType === "sequential"}
                  onClick={() => setSlotType("sequential")}
                />
              </div>
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-400">
                {slotType === "sequential"
                  ? t("doctors.bookingRangesRequired")
                  : t("doctors.slotTemplateRequired")}
              </label>
              <p className="mb-3 text-theme-xs text-gray-500 dark:text-gray-400">
                {t("doctors.clickDayToAddSlot")}
              </p>
              <SlotWeekEditor
                slots={slots}
                onChange={(next) => {
                  setSlots(next);
                  touch("slots");
                }}
                operatingDays={operatingDays}
                error={showError("slots", slots.length === 0)}
              />
              {showError("slots", slots.length === 0) && (
                <FieldError message={REQUIRED_FIELD_MESSAGE} />
              )}
            </div>
          </div>

          <div className="mt-6 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={() => (onCancel ? onCancel() : router.push("/doctors"))}
              disabled={isSubmitting}
              className="rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-white/[0.03]"
            >
              {t("common.cancel")}
            </button>
            <button
              type="button"
              onClick={addToBranch}
              disabled={isSubmitting}
              className="rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-600 disabled:cursor-not-allowed disabled:bg-brand-300"
            >
              {isSubmitting ? t("doctors.adding") : t("doctors.addToBranch")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
        {label}
      </label>
      {children}
    </div>
  );
}
