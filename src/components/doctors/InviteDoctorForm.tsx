"use client";
import React, { useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import BranchSelect, { BranchSelectValue } from "@/components/branches/BranchSelect";
import NmcDoctorSearch, {
  NmcDoctorResult,
} from "@/components/doctors/NmcDoctorSearch";
import SlotWeekEditor from "@/components/doctors/SlotWeekEditor";
import SpecializationPicker, {
  SpecializationValue,
} from "@/components/doctors/SpecializationPicker";
import { inputClass, SlotTypeOption } from "@/components/doctors/scheduleShared";
import { useRouter } from "next/navigation";
import {
  BranchOperatingDay,
  SlotTemplateItem,
  SlotType,
  branchScheduleApi,
  doctorInvitesApi,
} from "@/lib/api";
import { REQUIRED_FIELD_MESSAGE, useRequiredFields } from "@/hooks/useRequiredFields";
import FieldError from "@/components/form/FieldError";
import { getInputClass } from "@/components/form/fieldStyles";
import PhoneNumberField from "@/components/form/input/PhoneNumberField";
import { PHONE_VALIDATION_MESSAGE, isValidPhone } from "@/lib/phone";
import { getErrorMessage } from "@/lib/errorMessage";
import { useAuth } from "@/context/AuthContext";
import { useTranslation } from "@/hooks/useTranslation";

type RequiredField =
  | "branch"
  | "inviteName"
  | "inviteEmail"
  | "phone"
  | "feeAmount"
  | "currency"
  | "specializations"
  | "slots";

export function validateSlotTemplates(slots: SlotTemplateItem[]): string | null {
  if (slots.length === 0) return "At least one slot is required.";
  for (const slot of slots) {
    if (slot.end_time <= slot.start_time) {
      return `Slot end time must be after start time (${slot.start_time}).`;
    }
    if (slot.slot_duration_minutes < 5 || slot.slot_duration_minutes > 240) {
      return "Slot duration must be between 5 and 240 minutes.";
    }
    if (!slot.start_date) {
      return "Every slot needs a start date.";
    }
    if (!slot.end_date) {
      return "Every slot needs an end date.";
    }
    if (slot.end_date < slot.start_date) {
      return "A slot's end date must be on or after its start date.";
    }
  }
  return null;
}

interface InviteDoctorFormProps {
  /** When provided, the form is embedded (e.g. inside a drawer): success and
   * cancel hand control back to the host instead of navigating away. */
  onDone?: () => void;
  onCancel?: () => void;
}

export default function InviteDoctorForm({ onDone, onCancel }: InviteDoctorFormProps = {}) {
  const router = useRouter();
  const { can } = useAuth();
  const canManage = can("doctors:manage");
  const { t } = useTranslation();

  const [branch, setBranch] = useState<BranchSelectValue | null>(null);
  const [inviteName, setInviteName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [specializations, setSpecializations] = useState<SpecializationValue[]>([]);
  const [phone, setPhone] = useState("");
  const [regNo, setRegNo] = useState("");
  const [smcName, setSmcName] = useState("");
  const [doctorDegree, setDoctorDegree] = useState("");
  const [feeAmount, setFeeAmount] = useState("");
  const [currency, setCurrency] = useState("INR");
  const [certificate, setCertificate] = useState("");
  const [uploadingCertificate, setUploadingCertificate] = useState(false);
  const certificateFileRef = useRef<HTMLInputElement | null>(null);
  const [slotType, setSlotType] = useState<SlotType>("fixed");
  const [slots, setSlots] = useState<SlotTemplateItem[]>([]);
  const [operatingDays, setOperatingDays] = useState<BranchOperatingDay[] | null>(null);
  const [verified, setVerified] = useState<NmcDoctorResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { touch, showError, setSubmitted } = useRequiredFields<RequiredField>();

  useEffect(() => {
    if (!branch) {
      setOperatingDays(null);
      return;
    }
    branchScheduleApi
      .get(branch.id)
      .then((res) => setOperatingDays(res.operating_days))
      .catch(() => setOperatingDays(null));
  }, [branch]);

  const handleCertificateSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingCertificate(true);
    setError(null);
    try {
      const res = await doctorInvitesApi.uploadCertificate(file);
      setCertificate(res.certificate_url);
    } catch (err) {
      setError(getErrorMessage(err, t("doctors.certificateUploadFailed")));
    } finally {
      setUploadingCertificate(false);
      if (certificateFileRef.current) certificateFileRef.current.value = "";
    }
  };

  const onNmcSelect = (doc: NmcDoctorResult) => {
    setVerified(doc);
    setInviteName(doc.name);
    setRegNo(doc.registrationNo);
    setSmcName(doc.council);
    if (doc.doctorDegree) {
      setDoctorDegree(doc.doctorDegree);
    }
  };

  const createInvite = async () => {
    if (!canManage) {
      toast.error(t("appointments.noPermission"));
      return;
    }
    setSubmitted(true);
    const amount = Number(feeAmount);
    if (
      !branch ||
      !inviteName.trim() ||
      !inviteEmail.trim() ||
      !feeAmount.trim() ||
      !amount ||
      amount <= 0 ||
      !currency.trim() ||
      specializations.length === 0
    ) {
      setError(t("auth.pleaseFillRequired"));
      return;
    }
    if (phone.trim() !== "" && !isValidPhone(phone)) {
      setError(PHONE_VALIDATION_MESSAGE);
      return;
    }
    const slotError = validateSlotTemplates(slots);
    if (slotError) {
      setError(slotError);
      return;
    }
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await doctorInvitesApi.create(branch.id, {
        name: inviteName,
        specialization_ids: specializations.map((s) => s.id),
        email: inviteEmail,
        phone: phone || null,
        reg_no: regNo || null,
        smc_name: smcName || null,
        doctor_degree: doctorDegree || null,
        fee_amount: amount,
        currency,
        certificate: certificate || null,
        slot_type: slotType,
        slot_template: slots,
      });
      const isDirect = result.type === "direct_assignment";
      toast.success(
        isDirect ? t("doctors.doctorAddedSuccess") : t("doctors.inviteSent"),
      );
      if (onDone) {
        onDone();
      } else {
        router.push("/doctors");
      }
    } catch (err) {
      const message = getErrorMessage(err, t("doctors.unableToSendInvite"));
      setError(message);
      toast.error(message);
    } finally {
      setBusy(false);
    }
  };

  if (!canManage) {
    return (
      <div className="rounded-2xl border border-gray-200 bg-white p-6 text-sm text-gray-500 dark:border-gray-800 dark:bg-white/[0.03] dark:text-gray-400">
        {t("doctors.noPermissionInvite")}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-4 rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03] sm:p-6">
        <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">
          {t("doctors.inviteDoctorHeading")}
        </h3>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          {t("doctors.inviteCodeNotice")}
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

      <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03] sm:p-6">
        <div className="space-y-4">
          <NmcDoctorSearch onSelect={onNmcSelect} disabled={busy} />
          {verified && (
            <div className="mt-3 flex items-start justify-between gap-3 rounded-lg border border-success-500/30 bg-success-50 px-4 py-3 text-sm dark:bg-success-500/10">
              <div>
                <p className="font-medium text-success-700 dark:text-success-500">
                  {t("doctors.verifiedNmc")}
                </p>
                <p className="text-theme-xs text-gray-600 dark:text-gray-300">
                  {verified.name} · Reg. {verified.registrationNo} · {verified.council}
                  {verified.doctorDegree ? ` · ${verified.doctorDegree}` : ""}
                </p>
              </div>
              <button
                onClick={() => setVerified(null)}
                className="shrink-0 text-theme-xs text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200"
              >
                {t("common.clear")}
              </button>
            </div>
          )}
        </div>

        <div className="mt-6 space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label={t("doctors.nameRequired")}>
              <input type="text" value={inviteName} disabled className={inputClass} />
              {showError("inviteName", !inviteName.trim()) && (
                <FieldError message={REQUIRED_FIELD_MESSAGE} />
              )}
            </Field>
            <Field label={t("doctors.emailRequired")}>
              <input
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                onBlur={() => touch("inviteEmail")}
                className={getInputClass(showError("inviteEmail", !inviteEmail.trim()))}
              />
              {showError("inviteEmail", !inviteEmail.trim()) && (
                <FieldError message={REQUIRED_FIELD_MESSAGE} />
              )}
            </Field>
            <Field label={t("doctors.phone")}>
              <PhoneNumberField
                value={phone}
                onChange={setPhone}
                onBlur={() => touch("phone")}
                error={showError("phone", phone.trim() !== "" && !isValidPhone(phone))}
              />
            </Field>
            <Field label={t("doctors.regNoLabel")}>
              <input type="text" value={regNo} disabled className={inputClass} />
            </Field>
            <Field label={t("doctors.stateMedicalCouncil")}>
              <input type="text" value={smcName} disabled className={inputClass} />
            </Field>
            <Field label={t("doctors.degreeQualification")}>
              <input type="text" value={doctorDegree} disabled className={inputClass} />
            </Field>
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
              disabled={busy}
              error={showError("specializations", specializations.length === 0)}
              hint={
                showError("specializations", specializations.length === 0)
                  ? REQUIRED_FIELD_MESSAGE
                  : undefined
              }
            />
          </Field>

          <Field label={t("doctors.certificateLabel")}>
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
                <span className="text-sm text-gray-400 dark:text-gray-500">
                  {t("doctors.noCertificateUploaded")}
                </span>
              )}
            </div>
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
              {!branch && ` ${t("doctors.selectBranchToSeeClosedDays")}`}
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
            onClick={() => (onCancel ? onCancel() : router.push("/doctors"))}
            className="rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-white/[0.03]"
          >
            {t("common.cancel")}
          </button>
          <button
            onClick={createInvite}
            disabled={busy}
            className="rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-600 disabled:bg-brand-300"
          >
            {busy ? t("doctors.sending") : t("doctors.sendInvite")}
          </button>
        </div>
      </div>
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
