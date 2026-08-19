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
import { useAuth } from "@/context/AuthContext";
import { canCreateClinic, canUpdateClinic } from "@/lib/permissions";

interface ClinicFormProps {
  mode: "create" | "edit";
}

type RequiredField =
  | "name"
  | "city"
  | "district"
  | "state"
  | "postOffice"
  | "pinCode"
  | "tradeLicenseNumber";

export default function ClinicForm({ mode }: ClinicFormProps) {
  const router = useRouter();
  const params = useParams<{ clinicId?: string }>();
  const clinicId = typeof params.clinicId === "string" ? params.clinicId : "";
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
          toast("Trade license: No document uploaded.", { icon: "⚠️" });
        }
      })
      .catch((err) => {
        if (active) setError(getErrorMessage(err, "Failed to load clinic"));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
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
      setError("Enter a trade license number first.");
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
        getErrorMessage(err, "Unable to validate Trade License Number at this time. Please try again.")
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
      toast.error("You do not have permission to perform this action.");
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
      setError("Please fill in all required fields.");
      return;
    }
    if (!isEdit && tradeLicenseValidationStatus !== "VALID") {
      setError("Validate the Trade License Number before creating the clinic.");
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
      if (isEdit) {
        await clinicsApi.update(clinicId, input);
        toast.success("Clinic updated successfully.");
        redirectTo = `/clinics/${clinicId}/overview`;
      } else {
        const created = await clinicsApi.create(input);
        toast.success("Clinic created successfully.");
        redirectTo = `/clinics/${created.id}/overview`;
      }
      setTimeout(() => router.push(redirectTo), 150);
    } catch (err) {
      const message = getErrorMessage(err, "Unable to save clinic. Please try again.");
      setError(message);
      toast.error(message);
    } finally {
      setBusy(false);
    }
  };

  if (!canSubmit) {
    return (
      <div className="rounded-2xl border border-gray-200 bg-white p-6 text-sm text-gray-500 dark:border-gray-800 dark:bg-white/[0.03] dark:text-gray-400">
        You do not have permission to {isEdit ? "edit" : "create"} clinics.
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
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">
            {isEdit ? "Edit clinic" : "Create a clinic"}
          </h3>
          <Link href="/clinics" className="text-sm font-medium text-brand-500 hover:underline">
            View all clinics
          </Link>
        </div>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          {isEdit
            ? "Update this clinic&apos;s name, description and address details."
            : "Add a new clinic to your organization."}
        </p>

        {loading ? (
          <p className="py-8 text-center text-sm text-gray-500 dark:text-gray-400">
            Loading…
          </p>
        ) : (
          <div className="mt-6 space-y-4">
            <Field label="Name *">
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onBlur={() => touch("name")}
                className={getInputClass(showError("name", !name.trim()))}
              />
              {showError("name", !name.trim()) && <FieldError message={REQUIRED_FIELD_MESSAGE} />}
            </Field>
            <Field label="Description">
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                className={textareaClass}
              />
            </Field>
            <Field label="Pincode *">
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
              <Field label="Nearby location">
                <input
                  type="text"
                  value={nearbyLocation}
                  onChange={(e) => setNearbyLocation(e.target.value)}
                  className={inputClass}
                />
              </Field>
              <Field label="City *">
                <input
                  type="text"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  onBlur={() => touch("city")}
                  className={getInputClass(showError("city", !city.trim()))}
                />
                {showError("city", !city.trim()) && <FieldError message={REQUIRED_FIELD_MESSAGE} />}
              </Field>
              <Field label="District *">
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
              <Field label="State *">
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
              <Field label="Post office *">
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
              <Field label="Trade license number *">
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
                      ? "Validating…"
                      : tradeLicenseValidationStatus === "VALID"
                        ? "✓ Validated"
                        : "Validate"}
                  </button>
                </div>
                {showError("tradeLicenseNumber", !tradeLicenseNumber.trim()) ? (
                  <FieldError message={REQUIRED_FIELD_MESSAGE} />
                ) : tradeLicenseValidationStatus === "VALID" ? (
                  <p className="mt-1.5 text-theme-xs text-success-600 dark:text-success-500">
                    ✓ {tradeLicenseMessage ?? "Trade License Number validated successfully."}
                  </p>
                ) : tradeLicenseValidationStatus === "INVALID" ? (
                  <p className="mt-1.5 text-theme-xs text-error-600 dark:text-error-400">
                    ✕ {tradeLicenseMessage ?? "Trade License Number could not be validated."}
                    {!isEdit && " This clinic can't be created until it validates."}
                  </p>
                ) : (
                  <p className="mt-1.5 text-theme-xs text-warning-600 dark:text-orange-400">
                    ⚠ Trade License Number validation pending
                    {!isEdit && " — required before this clinic can be created"}
                  </p>
                )}
              </Field>
              <Field label="Drug license number">
                <input
                  type="text"
                  value={drugLicenseNumber}
                  onChange={(e) => setDrugLicenseNumber(e.target.value)}
                  className={inputClass}
                />
              </Field>
              <Field label="Clinical establishment reg. number">
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
            onClick={() => router.push(isEdit ? `/clinics/${clinicId}/overview` : "/clinics")}
            className="rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-white/[0.03]"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={busy || loading}
            className="rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-600 disabled:bg-brand-300"
          >
            {busy ? "Saving…" : isEdit ? "Save changes" : "Create clinic"}
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
