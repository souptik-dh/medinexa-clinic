"use client";
import React, { useCallback, useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import { DetailSkeleton, ListSkeleton } from "@/components/ui/skeleton/Skeleton";
import { useParams, useRouter } from "next/navigation";
import {
  BranchDoctor,
  BranchOperatingDay,
  DoctorAssignmentException,
  SlotTemplateItem,
  SlotType,
  branchScheduleApi,
  doctorsApi,
} from "@/lib/api";
import { validateSlotTemplates } from "@/components/doctors/InviteDoctorForm";
import { SlotTypeOption, inputClass } from "@/components/doctors/scheduleShared";
import SlotWeekEditor from "@/components/doctors/SlotWeekEditor";
import DatePicker from "@/components/form/date-picker";
import { formatDate, today } from "@/lib/utils";
import { useAuth } from "@/context/AuthContext";
import { getErrorMessage } from "@/lib/errorMessage";
import { useTranslation } from "@/hooks/useTranslation";

function formatDateOnly(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function enumerateDates(from: string, to: string): string[] {
  if (!from || !to) return [];
  const start = new Date(`${from}T00:00:00`);
  const end = new Date(`${to}T00:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return [];
  const dates: string[] = [];
  const cur = new Date(start);
  while (cur <= end) {
    dates.push(formatDateOnly(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return dates;
}

interface DoctorAssignmentEditPanelProps {
  /** Route-param overrides so the panel can be embedded (e.g. in a drawer)
   * outside its /doctors/[branchId]/[doctorId]/edit route. */
  branchId?: string;
  doctorId?: string;
  onDone?: () => void;
  onCancel?: () => void;
}

export default function DoctorAssignmentEditPanel({
  branchId: branchIdProp,
  doctorId: doctorIdProp,
  onDone,
  onCancel,
}: DoctorAssignmentEditPanelProps = {}) {
  const { t } = useTranslation();
  const router = useRouter();
  const params = useParams<{ branchId?: string; doctorId?: string }>();
  const branchId =
    branchIdProp ?? (typeof params.branchId === "string" ? params.branchId : "");
  const doctorId =
    doctorIdProp ?? (typeof params.doctorId === "string" ? params.doctorId : "");
  const { user, can } = useAuth();
  // A doctor editing their own assignment may only change slot_type/slot_template/
  // certificate — the backend rejects fee_amount from a doctor with 403
  // FEE_OWNER_CONTROLLED, so it must never be included in that role's PATCH body.
  const isDoctorSelf = user?.role === "doctor";
  const canManage = isDoctorSelf || can("doctors:manage");

  const [doctor, setDoctor] = useState<BranchDoctor | null>(null);
  const [loading, setLoading] = useState(true);

  const [fee, setFee] = useState("");
  const [certificate, setCertificate] = useState("");
  const [uploadingCertificate, setUploadingCertificate] = useState(false);
  const [slotType, setSlotType] = useState<SlotType>("fixed");
  const [slots, setSlots] = useState<SlotTemplateItem[]>([]);
  const [slotsDirty, setSlotsDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const certificateFileRef = useRef<HTMLInputElement | null>(null);

  const [operatingDays, setOperatingDays] = useState<BranchOperatingDay[] | null>(null);

  const [exceptions, setExceptions] = useState<DoctorAssignmentException[]>([]);
  const [exceptionsLoading, setExceptionsLoading] = useState(false);
  const [exceptionsError, setExceptionsError] = useState<string | null>(null);
  const [exceptionMode, setExceptionMode] = useState<"single" | "range">("single");
  const [newExceptionDate, setNewExceptionDate] = useState(today());
  const [rangeFrom, setRangeFrom] = useState(today());
  const [rangeTo, setRangeTo] = useState(today());
  const [newExceptionReason, setNewExceptionReason] = useState("");
  const [exceptionBusy, setExceptionBusy] = useState(false);

  const MAX_RANGE_DAYS = 180;

  const rangeDates = enumerateDates(rangeFrom, rangeTo);

  const load = useCallback(async () => {
    if (!branchId || !doctorId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await doctorsApi.listByBranch(branchId);
      const found = res.items.find((d) => d.id === doctorId) ?? null;
      if (!found) {
        setError(t("doctorProfile.doctorNotFoundAtBranch"));
      } else {
        setDoctor(found);
        setFee(String(found.fee_amount));
        setCertificate(found.certificate_url ?? "");
        setSlotType(found.slot_type ?? "fixed");
        setSlots([]);
        setSlotsDirty(false);
      }
    } catch (err) {
      setError(getErrorMessage(err, t("doctorProfile.failedToLoadDoctor")));
    } finally {
      setLoading(false);
    }
  }, [branchId, doctorId, t]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!branchId) return;
    branchScheduleApi
      .get(branchId)
      .then((res) => setOperatingDays(res.operating_days))
      .catch(() => setOperatingDays(null));
  }, [branchId]);

  const loadExceptions = useCallback(async (assignmentId: string) => {
    setExceptionsLoading(true);
    setExceptionsError(null);
    try {
      const res = await doctorsApi.listExceptions(assignmentId);
      setExceptions(res.items);
    } catch (err) {
      setExceptions([]);
      setExceptionsError(getErrorMessage(err, t("doctorAssignmentEdit.failedToLoadLeaveDates")));
    } finally {
      setExceptionsLoading(false);
    }
  }, [t]);

  useEffect(() => {
    if (doctor) loadExceptions(doctor.assignment_id);
  }, [doctor, loadExceptions]);

  const addExceptions = async () => {
    if (!doctor) return;
    if (exceptionMode === "single" && !newExceptionDate) return;
    if (exceptionMode === "range" && rangeDates.length === 0) return;
    if (rangeDates.length > MAX_RANGE_DAYS) {
      setExceptionsError(t("doctorAssignmentEdit.rangeSpanError", { days: rangeDates.length, max: MAX_RANGE_DAYS }));
      return;
    }
    setExceptionBusy(true);
    setExceptionsError(null);
    const reason = newExceptionReason.trim() || null;
    try {
      // One call marks the whole range as a leave — the backend stores it as a single
      // { excluded_date, end_date } row, not one row per day.
      await doctorsApi.createException(doctor.assignment_id, {
        excluded_date: exceptionMode === "range" ? rangeFrom : newExceptionDate,
        end_date: exceptionMode === "range" ? rangeTo : undefined,
        reason,
      });
      setNewExceptionReason("");
      await loadExceptions(doctor.assignment_id);
      toast.success(t("doctorAssignmentEdit.leaveDatesAdded"));
    } catch (err) {
      const message = getErrorMessage(err, t("doctorAssignmentEdit.couldNotAddLeave"));
      setExceptionsError(message);
      toast.error(message);
    } finally {
      setExceptionBusy(false);
    }
  };

  const removeException = async (exception: DoctorAssignmentException) => {
    if (!doctor) return;
    setExceptionBusy(true);
    setExceptionsError(null);
    try {
      await doctorsApi.removeException(doctor.assignment_id, exception.id);
      await loadExceptions(doctor.assignment_id);
      toast.success(t("doctorAssignmentEdit.leaveDateRemoved"));
    } catch (err) {
      const message = getErrorMessage(err, t("doctorAssignmentEdit.couldNotRemoveLeave"));
      setExceptionsError(message);
      toast.error(message);
    } finally {
      setExceptionBusy(false);
    }
  };

  const updateSlots = (next: SlotTemplateItem[]) => {
    setSlotsDirty(true);
    setSlots(next);
  };

  const handleCertificateSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !doctor) return;
    setUploadingCertificate(true);
    setError(null);
    try {
      const res = await doctorsApi.uploadAssignmentCertificate(doctor.assignment_id, file);
      setCertificate(res.certificate_url);
    } catch (err) {
      setError(getErrorMessage(err, t("doctors.certificateUploadFailed")));
    } finally {
      setUploadingCertificate(false);
      if (certificateFileRef.current) certificateFileRef.current.value = "";
    }
  };

  const save = async () => {
    if (!doctor) return;
    if (!canManage) {
      toast.error(t("appointments.noPermission"));
      return;
    }
    const amount = Number(fee);
    if (!isDoctorSelf && (!amount || amount <= 0)) {
      setError(t("doctorAssignmentEdit.invalidFeeAmount"));
      return;
    }
    if (slotsDirty) {
      const slotError = validateSlotTemplates(slots);
      if (slotError) {
        setError(slotError);
        return;
      }
    }
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await doctorsApi.updateAssignment(doctor.assignment_id, {
        ...(isDoctorSelf ? {} : { fee_amount: amount }),
        certificate: certificate.trim() || undefined,
        slot_type: slotType,
        ...(slotsDirty ? { slot_template: slots } : {}),
      });
      toast.success(t("doctorAssignmentEdit.assignmentUpdated"));
      if (onDone) {
        onDone();
      } else {
        router.push(isDoctorSelf ? "/doctor-schedule" : "/doctors");
      }
    } catch (err) {
      const message = getErrorMessage(err, t("doctorAssignmentEdit.unableToUpdateAssignment"));
      setError(message);
      toast.error(message);
    } finally {
      setBusy(false);
    }
  };

  if (!canManage) {
    return (
      <div className="rounded-2xl border border-gray-200 bg-white p-6 text-sm text-gray-500 dark:border-gray-800 dark:bg-white/[0.03] dark:text-gray-400">
        {t("doctorAssignmentEdit.noPermissionEditAssignments")}
      </div>
    );
  }

  if (loading) {
    return (
      <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03] sm:p-6">
        <DetailSkeleton rows={5} />
      </div>
    );
  }

  if (!doctor) {
    return (
      <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03] sm:p-6">
        <div className="rounded-lg border border-error-500/30 bg-error-50 px-4 py-3 text-sm text-error-600 dark:bg-error-500/10 dark:text-error-400">
          {error ?? t("doctorProfile.doctorNotFound")}
        </div>
        <button
          onClick={() => (onCancel ? onCancel() : router.push("/doctors"))}
          className="mt-4 rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-white/[0.03]"
        >
          {t("doctorProfile.backToDoctors")}
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03] sm:p-6">
      <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">
        {t("doctorAssignmentEdit.editAssignmentTitle", { name: doctor.name })}
      </h3>
      <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
        {t("doctorAssignmentEdit.updateFeeAndCertificate")}
      </p>

      {error && (
        <div className="mt-4 rounded-lg border border-error-500/30 bg-error-50 px-4 py-3 text-sm text-error-600 dark:bg-error-500/10 dark:text-error-400">
          {error}
        </div>
      )}

      <div className="mt-6 space-y-4">
        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
            {t("appointments.feeAmountLabel")} {!isDoctorSelf && "*"}
          </label>
          <input
            type="number"
            min="0"
            value={fee}
            onChange={(e) => setFee(e.target.value)}
            disabled={isDoctorSelf}
            className={`${inputClass} ${isDoctorSelf ? "cursor-not-allowed opacity-60" : ""}`}
          />
          {isDoctorSelf && (
            <p className="mt-1 text-theme-xs text-gray-500 dark:text-gray-400">
              {t("doctorAssignmentEdit.setByClinicHint")}
            </p>
          )}
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
            {t("doctors.certificateLabel")}
          </label>
          <div className="flex items-center gap-3">
            <input
              ref={certificateFileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,application/pdf"
              onChange={handleCertificateSelect}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => certificateFileRef.current?.click()}
              disabled={uploadingCertificate}
              className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600 disabled:bg-brand-300"
            >
              {uploadingCertificate
                ? t("doctors.uploading")
                : certificate
                  ? t("doctors.replaceCertificate")
                  : t("doctors.uploadCertificate")}
            </button>
            {certificate ? (
              <a
                href={certificate}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-brand-500 hover:underline"
              >
                {t("doctors.viewCertificate")}
              </a>
            ) : (
              <span className="text-sm text-warning-600 dark:text-orange-400">
                {t("doctorAssignmentEdit.pendingNoCertificate")}
              </span>
            )}
          </div>
        </div>

        <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-gray-800 dark:bg-white/[0.02]">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
            {t("doctorAssignmentEdit.assignmentPeriod")}
          </p>
          <p className="text-sm text-gray-700 dark:text-gray-300">
            <span className="font-medium">{t("doctorAssignmentEdit.startDateLabel")}</span>{" "}
            {doctor.start_date ? formatDate(doctor.start_date) : "—"}
            <span className="mx-2 text-gray-300 dark:text-gray-700">·</span>
            <span className="font-medium">{t("doctorAssignmentEdit.endDateLabel")}</span>{" "}
            {doctor.end_date ? formatDate(doctor.end_date) : t("doctorMySchedule.ongoing")}
          </p>
          <p className="mt-2 text-theme-xs text-gray-500 dark:text-gray-400">
            {t("doctorAssignmentEdit.derivedFromSlotHint")}
          </p>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-400">
            {t("doctorAssignmentEdit.leaveUnavailableDates")}
          </label>
          <p className="mb-3 text-theme-xs text-gray-500 dark:text-gray-400">
            {t("doctorAssignmentEdit.leaveDatesHint")}
          </p>

          {exceptionsError && (
            <div className="mb-3 rounded-lg border border-error-500/30 bg-error-50 px-4 py-3 text-sm text-error-600 dark:bg-error-500/10 dark:text-error-400">
              {exceptionsError}
            </div>
          )}

          {(() => {
            // The list endpoint now also returns cancelled leaves (kept as an audit
            // record server-side) — only active ones are still "in effect" here.
            const activeExceptions = exceptions.filter((e) => e.status !== "cancelled");
            if (exceptionsLoading) {
              return <ListSkeleton rows={3} />;
            }
            if (activeExceptions.length === 0) {
              return <p className="text-sm text-gray-500 dark:text-gray-400">{t("doctorAssignmentEdit.noLeaveDatesAdded")}</p>;
            }
            return (
              <ul className="mb-4 space-y-2">
                {activeExceptions.map((exception) => (
                  <li
                    key={exception.id}
                    className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 px-3 py-2 dark:border-gray-800"
                  >
                    <div>
                      <p className="text-sm font-medium text-gray-800 dark:text-white/90">
                        {exception.end_date && exception.end_date !== exception.excluded_date
                          ? `${formatDate(exception.excluded_date)} – ${formatDate(exception.end_date)}`
                          : formatDate(exception.excluded_date)}
                      </p>
                      {exception.reason && (
                        <p className="text-theme-xs text-gray-500 dark:text-gray-400">
                          {exception.reason}
                        </p>
                      )}
                    </div>
                    <button
                      onClick={() => removeException(exception)}
                      disabled={exceptionBusy}
                      className="rounded-lg px-2 py-1.5 text-xs font-medium text-error-600 hover:bg-error-50 disabled:opacity-40 dark:hover:bg-error-500/10"
                    >
                      {t("schedule.remove")}
                    </button>
                  </li>
                ))}
              </ul>
            );
          })()}

          <div className="mb-3 flex gap-3">
            <SlotTypeOption
              label={t("schedule.singleDate")}
              description={t("doctorAssignmentEdit.singleDateDescAssignment")}
              selected={exceptionMode === "single"}
              onClick={() => setExceptionMode("single")}
            />
            <SlotTypeOption
              label={t("schedule.dateRange")}
              description={t("doctorAssignmentEdit.dateRangeDescAssignment")}
              selected={exceptionMode === "range"}
              onClick={() => setExceptionMode("range")}
            />
          </div>

          <div className="flex flex-wrap items-end gap-3">
            {exceptionMode === "single" ? (
              <div>
                <DatePicker
                  id="exception-date"
                  label={t("schedule.date")}
                  placeholder={t("schedule.selectDate")}
                  defaultDate={newExceptionDate || undefined}
                  onChange={(_, dateStr) => {
                    if (dateStr) setNewExceptionDate(dateStr);
                  }}
                />
              </div>
            ) : (
              <>
                <div>
                  <DatePicker
                    id="exception-range-from"
                    label={t("appointments.from")}
                    placeholder={t("schedule.selectDate")}
                    defaultDate={rangeFrom || undefined}
                    onChange={(_, dateStr) => {
                      if (dateStr) {
                        setRangeFrom(dateStr);
                        if (rangeTo < dateStr) setRangeTo(dateStr);
                      }
                    }}
                  />
                </div>
                <div>
                  <DatePicker
                    id="exception-range-to"
                    label={t("appointments.to")}
                    placeholder={t("schedule.selectDate")}
                    defaultDate={rangeTo || undefined}
                    onChange={(_, dateStr) => {
                      if (dateStr) setRangeTo(dateStr);
                    }}
                  />
                </div>
              </>
            )}
            <div className="flex-1">
              <label className="mb-1.5 block text-xs font-medium text-gray-500 dark:text-gray-400">
                {t("doctorAssignmentEdit.reasonOptionalFor", {
                  scope: exceptionMode === "range" ? t("doctorAssignmentEdit.everyDateInRange") : t("doctorAssignmentEdit.thisDate"),
                })}
              </label>
              <input
                type="text"
                value={newExceptionReason}
                onChange={(e) => setNewExceptionReason(e.target.value)}
                placeholder={t("doctorAssignmentEdit.onLeavePlaceholder")}
                className={inputClass}
              />
            </div>
            <button
              onClick={addExceptions}
              disabled={
                exceptionBusy ||
                (exceptionMode === "single" ? !newExceptionDate : rangeDates.length === 0)
              }
              className="h-11 shrink-0 rounded-lg bg-brand-500 px-4 text-sm font-medium text-white hover:bg-brand-600 disabled:bg-brand-300"
            >
              {exceptionBusy
                ? t("schedule.adding")
                : exceptionMode === "range"
                  ? (rangeDates.length === 1
                      ? t("doctorAssignmentEdit.addDate", { count: rangeDates.length })
                      : t("doctorAssignmentEdit.addDates", { count: rangeDates.length || "" }))
                  : t("doctorAssignmentEdit.addSingle")}
            </button>
          </div>
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-400">
            {t("doctorAssignmentEdit.bookingType")}
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
            {slotType === "sequential" ? t("doctorAssignmentEdit.bookingRanges") : t("doctorAssignmentEdit.weeklySchedule")}
          </label>
          <p className="mb-3 text-theme-xs text-gray-500 dark:text-gray-400">
            {t("doctorAssignmentEdit.clickDayHintAssignment")}
          </p>
          <SlotWeekEditor
            slots={slots}
            onChange={updateSlots}
            operatingDays={operatingDays}
          />
        </div>

      </div>

      <div className="mt-6 flex items-center justify-end gap-3">
        <button
          onClick={() => (onCancel ? onCancel() : router.push("/doctors"))}
          className="rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-white/[0.03]"
        >
          {t("common.cancel")}
        </button>
        <button
          onClick={save}
          disabled={busy}
          className="rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-600 disabled:bg-brand-300"
        >
          {busy ? t("auth.saving") : t("settings.saveChanges")}
        </button>
      </div>
    </div>
  );
}
