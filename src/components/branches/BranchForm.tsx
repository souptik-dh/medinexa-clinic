"use client";
import React, { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import PincodeField from "@/components/common/PincodeField";
import { PostOffice } from "@/hooks/usePincodeLookup";
import { ApiError, TradeLicenseValidationStatus, branchesApi, clinicsApi } from "@/lib/api";
import { REQUIRED_FIELD_MESSAGE, useRequiredFields } from "@/hooks/useRequiredFields";
import FieldError from "@/components/form/FieldError";
import { getInputClass, inputClass } from "@/components/form/fieldStyles";
import PhoneNumberField from "@/components/form/input/PhoneNumberField";
import { PHONE_VALIDATION_MESSAGE, isValidPhone } from "@/lib/phone";
import { getErrorMessage } from "@/lib/errorMessage";
import toast from "react-hot-toast";
import { useAuth } from "@/context/AuthContext";
import { canCreateBranch, canUpdateBranch } from "@/lib/permissions";

interface BranchFormProps {
  mode: "create" | "edit";
}

type RequiredField =
  | "name"
  | "address"
  | "phone"
  | "city"
  | "district"
  | "state"
  | "postOffice"
  | "pinCode"
  | "tradeLicenseNumber";

export default function BranchForm({ mode }: BranchFormProps) {
  const router = useRouter();
  const params = useParams<{ clinicId?: string; branchId?: string }>();
  const clinicId = typeof params.clinicId === "string" ? params.clinicId : "";
  const branchId = typeof params.branchId === "string" ? params.branchId : "";
  const isEdit = mode === "edit";

  const { user } = useAuth();
  const userPermissions = user?.role === "branch_staff" ? user.permissions : undefined;
  const isAdmin = user?.role === "clinic_owner" || user?.role === "sys_admin";
  const canSubmit = isAdmin || (isEdit ? canUpdateBranch(userPermissions) : canCreateBranch(userPermissions));

  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [phone, setPhone] = useState("");
  const [timezone, setTimezone] = useState("Asia/Kolkata");
  const [nearbyLocation, setNearbyLocation] = useState("");
  const [city, setCity] = useState("");
  const [district, setDistrict] = useState("");
  const [pinCode, setPinCode] = useState("");
  const [stateField, setStateField] = useState("");
  const [postOffice, setPostOffice] = useState("");
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");
  const [tradeLicenseNumber, setTradeLicenseNumber] = useState("");
  const [tradeLicenseValidationStatus, setTradeLicenseValidationStatus] =
    useState<TradeLicenseValidationStatus>("PENDING");
  const [tradeLicenseMessage, setTradeLicenseMessage] = useState<string | null>(null);
  const [validating, setValidating] = useState(false);
  const [drugLicenseNumber, setDrugLicenseNumber] = useState("");
  const [clinicalEstablishmentRegNumber, setClinicalEstablishmentRegNumber] =
    useState("");
  const [clinicName, setClinicName] = useState("");
  const [loading, setLoading] = useState(isEdit);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { touch, showError, setSubmitted } = useRequiredFields<RequiredField>();

  useEffect(() => {
    if (!clinicId) {
      setLoading(false);
      return;
    }
    let active = true;
    clinicsApi
      .get(clinicId)
      .then((c) => {
        if (active) setClinicName(c.name);
      })
      .catch(() => {});

    if (isEdit && branchId) {
      branchesApi
        .list(clinicId)
        .then((res) => {
          if (!active) return;
          const b = res.items.find((x) => x.id === branchId);
          if (!b) {
            setError("Branch not found.");
            return;
          }
          setName(b.name);
          setAddress(b.address);
          setPhone(b.phone);
          setTimezone(b.timezone);
          setNearbyLocation(b.nearby_location ?? "");
          setCity(b.city ?? "");
          setDistrict(b.district ?? "");
          setPinCode(b.pin_code ?? "");
          setStateField(b.state ?? "");
          setPostOffice(b.post_office ?? "");
          setLat(b.lat !== null && b.lat !== undefined ? String(b.lat) : "");
          setLng(b.lng !== null && b.lng !== undefined ? String(b.lng) : "");
          setTradeLicenseNumber(b.trade_license_number ?? "");
          setTradeLicenseValidationStatus(b.trade_license_validation_status ?? "PENDING");
          setDrugLicenseNumber(b.drug_license_number ?? "");
          setClinicalEstablishmentRegNumber(b.clinical_establishment_reg_number ?? "");
        })
        .catch((err) => {
          if (active)
            setError(
              err instanceof ApiError ? err.message : "Failed to load branch"
            );
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    } else {
      setLoading(false);
    }

    return () => {
      active = false;
    };
  }, [isEdit, clinicId, branchId]);

  const onSelectPostOffice = (po: PostOffice) => {
    setPinCode(po.Pincode);
    setDistrict(po.District);
    setStateField(po.State);
    setPostOffice(po.Name);
    if (!address) setAddress(po.Name);
  };

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
        err instanceof ApiError
          ? err.message
          : "Unable to validate Trade License Number at this time. Please try again."
      );
    } finally {
      setValidating(false);
    }
  };

  const submit = async () => {
    if (!canSubmit) {
      toast.error("You do not have permission to perform this action.");
      return;
    }
    setSubmitted(true);
    if (
      !name.trim() ||
      !address.trim() ||
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
    if (!isValidPhone(phone)) {
      setError(PHONE_VALIDATION_MESSAGE);
      return;
    }
    if (!isEdit && tradeLicenseValidationStatus !== "VALID") {
      setError("Validate the Trade License Number before creating the branch.");
      return;
    }
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const input = {
        name,
        address,
        phone,
        timezone,
        nearby_location: nearbyLocation || null,
        city,
        district,
        pin_code: pinCode,
        state: stateField,
        post_office: postOffice,
        lat: lat === "" ? null : Number(lat),
        lng: lng === "" ? null : Number(lng),
        trade_license_number: tradeLicenseNumber,
        trade_license_validation_status: tradeLicenseValidationStatus,
        drug_license_number: drugLicenseNumber || null,
        clinical_establishment_reg_number: clinicalEstablishmentRegNumber || null,
      };
      if (isEdit) {
        await branchesApi.update(branchId, input);
        toast.success("Branch updated successfully.");
      } else {
        await branchesApi.create(clinicId, input);
        toast.success("Branch created successfully.");
      }
      router.push("/branches");
    } catch (err) {
      const message = getErrorMessage(err, "Unable to save branch. Please try again.");
      setError(message);
      toast.error(message);
    } finally {
      setBusy(false);
    }
  };

  if (!canSubmit) {
    return (
      <div className="rounded-2xl border border-gray-200 bg-white p-6 text-sm text-gray-500 dark:border-gray-800 dark:bg-white/[0.03] dark:text-gray-400">
        You do not have permission to {isEdit ? "edit" : "create"} branches.
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
        <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">
          {isEdit ? "Edit branch" : "Create branch"}
          {clinicName && (
            <span className="ml-2 text-sm font-normal text-gray-500 dark:text-gray-400">
              — {clinicName}
            </span>
          )}
        </h3>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          {isEdit
            ? "Update this branch&apos;s contact and address details."
            : "Add a new branch to the selected clinic."}
        </p>

        {loading ? (
          <p className="py-8 text-center text-sm text-gray-500 dark:text-gray-400">
            Loading…
          </p>
        ) : (
          <div className="mt-6 space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
              <Field label="Phone *">
                <PhoneNumberField
                  value={phone}
                  onChange={setPhone}
                  onBlur={() => touch("phone")}
                  error={showError("phone", !isValidPhone(phone))}
                />
              </Field>
            </div>
            <Field label="Address *">
              <input
                type="text"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                onBlur={() => touch("address")}
                className={getInputClass(showError("address", !address.trim()))}
              />
              {showError("address", !address.trim()) && (
                <FieldError message={REQUIRED_FIELD_MESSAGE} />
              )}
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
            <Field label="Timezone *">
              <input
                type="text"
                value={timezone}
                disabled
                onChange={(e) => setTimezone(e.target.value)}
                className={`${inputClass} disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-500 dark:disabled:bg-gray-800`}
              />
            </Field>
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
                    {!isEdit && " This branch can't be created until it validates."}
                  </p>
                ) : (
                  <p className="mt-1.5 text-theme-xs text-warning-600 dark:text-orange-400">
                    ⚠ Trade License Number validation pending
                    {!isEdit && " — required before this branch can be created"}
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
            onClick={() => router.push("/branches")}
            className="rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-white/[0.03]"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={busy || loading}
            className="rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-600 disabled:bg-brand-300"
          >
            {busy ? "Saving…" : isEdit ? "Save changes" : "Create branch"}
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
