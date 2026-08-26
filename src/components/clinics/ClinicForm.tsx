"use client";
import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import toast from "react-hot-toast";
import PincodeField from "@/components/common/PincodeField";
import { PostOffice } from "@/hooks/usePincodeLookup";
import { TradeLicenseValidationStatus, clinicsApi } from "@/lib/api";
import { REQUIRED_FIELD_MESSAGE, useRequiredFields } from "@/hooks/useRequiredFields";
import FieldError from "@/components/form/FieldError";
import { getInputClass, inputClass, textareaClass } from "@/components/form/fieldStyles";
import { getErrorMessage } from "@/lib/errorMessage";
import { DetailSkeleton } from "@/components/ui/skeleton/Skeleton";
import { useAuth } from "@/context/AuthContext";
import { canCreateClinic, canUpdateClinic } from "@/lib/permissions";
import { useTranslation } from "@/hooks/useTranslation";

interface ClinicFormProps {
  mode: "create" | "edit";
  /** Route-param override so the form can be embedded (e.g. in a drawer)
   * outside its /clinics/[clinicId]/edit route. */
  clinicId?: string;
  /** When provided, the form is embedded: success and cancel hand control
   * back to the host instead of navigating away. */
  onDone?: (clinicId?: string) => void;
  onCancel?: () => void;
}

type RequiredField =
  | "name"
  | "city"
  | "district"
  | "state"
  | "postOffice"
  | "pinCode"
  | "tradeLicenseNumber";

export default function ClinicForm({
  mode,
  clinicId: clinicIdProp,
  onDone,
  onCancel,
}: ClinicFormProps) {
  const { t } = useTranslation();
  const router = useRouter();
  const params = useParams<{ clinicId?: string }>();
  const clinicId =
    clinicIdProp ?? (typeof params.clinicId === "string" ? params.clinicId : "");
  const isEdit = mode === "edit";

  const { user } = useAuth();
  const userPermissions = user?.role === "branch_staff" ? user.permissions : undefined;
  const isAdmin = user?.role === "clinic_owner" || user?.role === "sys_admin";
  const canSubmit = isAdmin || (isEdit ? canUpdateClinic(userPermissions) : canCreateClinic(userPermissions));

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [nearbyLocation, setNearbyLocation] = useState("");
  const [city, setCity] = useState("");
  const [district, setDistrict] = useState("");
  const [pinCode, setPinCode] = useState("");
  const [stateField, setStateField] = useState("");
  const [postOffice, setPostOffice] = useState("");
  const [tradeLicenseNumber, setTradeLicenseNumber] = useState("");
  const [tradeLicenseUrl, setTradeLicenseUrl] = useState<string | null>(null);
  const [tradeLicenseValidationStatus, setTradeLicenseValidationStatus] =
    useState<TradeLicenseValidationStatus>("PENDING");
  const [tradeLicenseMessage, setTradeLicenseMessage] = useState<string | null>(null);
  const [validating, setValidating] = useState(false);
  const [drugLicenseNumber, setDrugLicenseNumber] = useState("");
  const [clinicalEstablishmentRegNumber, setClinicalEstablishmentRegNumber] =
    useState("");
  const [loading, setLoading] = useState(isEdit);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { touch, showError, setSubmitted } = useRequiredFields<RequiredField>();

  useEffect(() => {
    if (!isEdit || !clinicId) {
      setLoading(false);
      return;
    }
    let active = true;
    clinicsApi
      .get(clinicId)
      .then((c) => {
        if (!active) return;
        setName(c.name ?? "");
        setDescription(c.description ?? "");
        setNearbyLocation(c.nearby_location ?? "");
        setCity(c.city ?? "");
        setDistrict(c.district ?? "");
        setPinCode(c.pin_code ?? "");
        setStateField(c.state ?? "");
        setPostOffice(c.post_office ?? "");
        setTradeLicenseNumber(c.trade_license_number ?? "");
        setTradeLicenseUrl(c.trade_license_url ?? null);
        setTradeLicenseValidationStatus(c.trade_license_validation_status ?? "PENDING");
        setDrugLicenseNumber(c.drug_license_number ?? "");
        setClinicalEstablishmentRegNumber(c.clinical_establishment_reg_number ?? "");
        if (!c.trade_license_url) {
          toast(`${t("branches.tradeLicense")}: ${t("branches.noDocumentUploaded")}`, {
            icon: "⚠️",
          });
        }
      })
      .catch((err) => {
        if (active) setError(getErrorMessage(err, t("clinicsPage.failedToLoadDetails")));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEdit, clinicId]);

  const onTradeLicenseNumberChange = (value: string) => {
    setTradeLicenseNumber(value);
    // Re-validation is required whenever the number changes — a validated/rejected
    // status only ever applies to the exact number it was checked against.
    if (tradeLicenseValidationStatus !== "PENDING") {
      setTradeLicenseValidationStatus("PENDING");
      setTradeLicenseMessage(null);
    }
  };

  const validateTradeLicense = async () => {
    const number = tradeLicenseNumber.trim();
    if (!number) {
      setError(t("clinicForm.enterTradeLicenseNumberFirst"));
      return;
    }
    setValidating(true);
    setError(null);
    try {
      const res = await clinicsApi.validateTradeLicense(number);
      setTradeLicenseValidationStatus(res.status);
      setTradeLicenseMessage(res.message);
    } catch (err) {
      setTradeLicenseValidationStatus("PENDING");
      setTradeLicenseMessage(
        getErrorMessage(err, t("clinicForm.unableToValidateTradeLicense"))
      );
    } finally {
      setValidating(false);
    }
  };

  const onSelectPostOffice = (po: PostOffice) => {
    setPinCode(po.Pincode);
    setDistrict(po.District);
    setStateField(po.State);
    setPostOffice(po.Name);
  };

  const submit = async () => {
    if (!canSubmit) {
      toast.error(t("appointments.noPermission"));
      return;
    }
    setSubmitted(true);
    if (
      !name.trim() ||
      !city.trim() ||
      !district.trim() ||
      !stateField.trim() ||
      !postOffice.trim() ||
      !pinCode.trim() ||
      !tradeLicenseNumber.trim()
    ) {
      setError(t("auth.pleaseFillRequired"));
      return;
    }
    if (!isEdit && tradeLicenseValidationStatus !== "VALID") {
      setError(t("clinicForm.validateTradeLicenseBeforeCreate"));
      return;
    }
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const input = {
        name,
        description: description || null,
        nearby_location: nearbyLocation || null,
        city,
        district,
        pin_code: pinCode,
        state: stateField,
        post_office: postOffice,
        trade_license_number: tradeLicenseNumber,
        trade_license_validation_status: tradeLicenseValidationStatus,
        drug_license_number: drugLicenseNumber || null,
        clinical_establishment_reg_number: clinicalEstablishmentRegNumber || null,
      };
      let redirectTo = "/clinics";
      let savedClinicId: string | undefined;
      if (isEdit) {
        await clinicsApi.update(clinicId, input);
        toast.success(t("common.updateSuccess"));
        savedClinicId = clinicId;
        redirectTo = `/clinics/${clinicId}/overview`;
      } else {
        const created = await clinicsApi.create(input);
        toast.success(t("common.createSuccess"));
        savedClinicId = created.id;
        redirectTo = `/clinics/${created.id}/overview`;
      }
      if (onDone) {
        onDone(savedClinicId);
        return;
      }
      setTimeout(() => router.push(redirectTo), 150);
    } catch (err) {
      const message = getErrorMessage(err, t("clinicForm.unableToSaveClinic"));
      setError(message);
      toast.error(message);
    } finally {
      setBusy(false);
    }
  };

  if (!canSubmit) {
    return (
      <div className="rounded-2xl border border-gray-200 bg-white p-6 text-sm text-gray-500 dark:border-gray-800 dark:bg-white/[0.03] dark:text-gray-400">
        {isEdit
          ? t("clinicForm.noPermissionToEditClinics")
          : t("clinicForm.noPermissionToCreateClinics")}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="rounded-lg border border-error-500/30 bg-error-50 px-4 py-3 text-sm text-error-600 dark:bg-error-500/10 dark:text-error-400">
          {error}
        </div>
      )}

      <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03] sm:p-6">
        {!onCancel && (
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">
              {isEdit ? t("clinicsPage.editClinic") : t("clinicsPage.createClinic")}
            </h3>
            <Link
              href={isEdit && clinicId ? `/clinics/${clinicId}/overview` : "/clinics"}
              className="text-sm font-medium text-brand-500 hover:underline"
            >
              {isEdit ? t("clinicForm.backToOverview") : t("clinicForm.viewAllClinics")}
            </Link>
          </div>
        )}
        {!onCancel && (
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            {isEdit
              ? t("clinicForm.editClinicDesc")
              : t("clinicForm.createClinicDesc")}
          </p>
        )}

        {loading ? (
          <DetailSkeleton rows={7} />
        ) : (
          <div className="mt-6 space-y-4">
            <Field label={t("doctors.nameRequired")}>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onBlur={() => touch("name")}
                className={getInputClass(showError("name", !name.trim()))}
              />
              {showError("name", !name.trim()) && <FieldError message={REQUIRED_FIELD_MESSAGE} />}
            </Field>
            <Field label={t("labTests.description")}>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                className={textareaClass}
              />
            </Field>
            <Field label={`${t("common.pincode")} *`}>
              <PincodeField
                value={pinCode}
                onChange={setPinCode}
                onSelect={onSelectPostOffice}
                onBlur={() => touch("pinCode")}
                autoValidate={!isEdit}
                error={showError("pinCode", !pinCode.trim())}
                hint={showError("pinCode", !pinCode.trim()) ? REQUIRED_FIELD_MESSAGE : undefined}
              />
            </Field>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <Field label={t("common.nearbyLocation")}>
                <input
                  type="text"
                  value={nearbyLocation}
                  onChange={(e) => setNearbyLocation(e.target.value)}
                  className={inputClass}
                />
              </Field>
              <Field label={`${t("common.city")} *`}>
                <input
                  type="text"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  onBlur={() => touch("city")}
                  className={getInputClass(showError("city", !city.trim()))}
                />
                {showError("city", !city.trim()) && <FieldError message={REQUIRED_FIELD_MESSAGE} />}
              </Field>
              <Field label={`${t("common.district")} *`}>
                <input
                  type="text"
                  value={district}
                  onChange={(e) => setDistrict(e.target.value)}
                  onBlur={() => touch("district")}
                  className={getInputClass(showError("district", !district.trim()))}
                />
                {showError("district", !district.trim()) && (
                  <FieldError message={REQUIRED_FIELD_MESSAGE} />
                )}
              </Field>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label={`${t("common.state")} *`}>
                <input
                  type="text"
                  value={stateField}
                  onChange={(e) => setStateField(e.target.value)}
                  onBlur={() => touch("state")}
                  className={getInputClass(showError("state", !stateField.trim()))}
                />
                {showError("state", !stateField.trim()) && (
                  <FieldError message={REQUIRED_FIELD_MESSAGE} />
                )}
              </Field>
              <Field label={`${t("common.postOffice")} *`}>
                <input
                  type="text"
                  value={postOffice}
                  onChange={(e) => setPostOffice(e.target.value)}
                  onBlur={() => touch("postOffice")}
                  className={getInputClass(showError("postOffice", !postOffice.trim()))}
                />
                {showError("postOffice", !postOffice.trim()) && (
                  <FieldError message={REQUIRED_FIELD_MESSAGE} />
                )}
              </Field>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <Field label={`${t("clinicForm.tradeLicenseNumber")} *`}>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={tradeLicenseNumber}
                    onChange={(e) => onTradeLicenseNumberChange(e.target.value)}
                    onBlur={() => touch("tradeLicenseNumber")}
                    className={getInputClass(
                      showError("tradeLicenseNumber", !tradeLicenseNumber.trim()) ||
                        tradeLicenseValidationStatus === "INVALID"
                    )}
                  />
                  <button
                    type="button"
                    onClick={validateTradeLicense}
                    disabled={validating || !tradeLicenseNumber.trim()}
                    className={`h-11 shrink-0 whitespace-nowrap rounded-lg px-3.5 text-sm font-medium disabled:opacity-50 ${
                      tradeLicenseValidationStatus === "VALID"
                        ? "bg-success-50 text-success-700 hover:bg-success-100 dark:bg-success-500/10 dark:text-success-500"
                        : "bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
                    }`}
                  >
                    {validating
                      ? t("clinicForm.validating")
                      : tradeLicenseValidationStatus === "VALID"
                        ? `✓ ${t("clinicForm.validated")}`
                        : t("clinicForm.validate")}
                  </button>
                </div>
                {showError("tradeLicenseNumber", !tradeLicenseNumber.trim()) ? (
                  <FieldError message={REQUIRED_FIELD_MESSAGE} />
                ) : tradeLicenseValidationStatus === "VALID" ? (
                  <p className="mt-1.5 text-theme-xs text-success-600 dark:text-success-500">
                    ✓ {tradeLicenseMessage ?? t("clinicForm.tradeLicenseValidatedSuccessfully")}
                  </p>
                ) : tradeLicenseValidationStatus === "INVALID" ? (
                  <p className="mt-1.5 text-theme-xs text-error-600 dark:text-error-400">
                    ✕ {tradeLicenseMessage ?? t("clinicForm.tradeLicenseCouldNotBeValidated")}
                    {!isEdit && ` ${t("clinicForm.cantCreateUntilValidates")}`}
                  </p>
                ) : (
                  <p className="mt-1.5 text-theme-xs text-warning-600 dark:text-orange-400">
                    ⚠ {t("clinicForm.tradeLicenseValidationPending")}
                    {!isEdit && ` — ${t("clinicForm.requiredBeforeCreate")}`}
                  </p>
                )}
              </Field>
              <Field label={t("clinicForm.drugLicenseNumber")}>
                <input
                  type="text"
                  value={drugLicenseNumber}
                  onChange={(e) => setDrugLicenseNumber(e.target.value)}
                  className={inputClass}
                />
              </Field>
              <Field label={t("clinicForm.clinicalEstablishmentRegNumber")}>
                <input
                  type="text"
                  value={clinicalEstablishmentRegNumber}
                  onChange={(e) => setClinicalEstablishmentRegNumber(e.target.value)}
                  className={inputClass}
                />
              </Field>
            </div>
          </div>
        )}

        <div className="mt-6 flex items-center justify-end gap-3">
          <button
            onClick={() =>
              onCancel
                ? onCancel()
                : router.push(isEdit ? `/clinics/${clinicId}/overview` : "/clinics")
            }
            className="rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-white/[0.03]"
          >
            {t("common.cancel")}
          </button>
          <button
            onClick={submit}
            disabled={busy || loading}
            className="rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-600 disabled:bg-brand-300"
          >
            {busy ? t("auth.saving") : isEdit ? t("clinicForm.saveChanges") : t("clinicsPage.createClinic")}
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
