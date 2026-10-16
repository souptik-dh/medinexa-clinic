"use client";
import React, {
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ApiError,
  AppointmentPatientDetailsInput,
  PatientLink,
  PatientLookupItem,
  PatientRelationship,
  patientsApi,
} from "@/lib/api";
import { useTranslation } from "@/hooks/useTranslation";

const inputClass =
  "h-11 w-full rounded-lg border border-gray-300 bg-transparent px-3 text-sm text-gray-800 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90";

const FAMILY_RELATIONSHIPS: PatientRelationship[] = [
  "spouse",
  "child",
  "parent",
  "sibling",
  "friend",
  "other",
];

const RELATIONSHIP_KEYS: Record<PatientRelationship, string> = {
  self: "appointments.relSelf",
  spouse: "appointments.relSpouse",
  child: "appointments.relChild",
  parent: "appointments.relParent",
  sibling: "appointments.relSibling",
  friend: "appointments.relFriend",
  other: "patientDetail.other",
};

interface SelectedProfile {
  id: string;
  name: string | null;
  phone: string | null;
}

export interface BookingPatientPickerHandle {
  /** Returns the first validation message for the patient section, or null. */
  validate(): string | null;
  /** `patient_details` payload for POST /appointments and /lab-test-appointments. */
  buildDetails(): AppointmentPatientDetailsInput;
  reset(): void;
  /** True when the error was attached to a field; false means the host shows it. */
  applyServerError(err: unknown, message: string): boolean;
}

interface BookingPatientPickerProps {
  disabled?: boolean;
  /** Lab bookings require phone, age and gender; doctor bookings only age+gender. */
  requirePhone?: boolean;
}

function isBlank(v: string | null | undefined): boolean {
  return !v || v.trim() === "";
}

/** Accepts 10-digit Indian mobiles (optionally with +91 / spaces). */
function isValidMobile(raw: string): boolean {
  const digits = raw.replace(/\D/g, "");
  return /^[6-9]\d{9}$/.test(digits) || /^91[6-9]\d{9}$/.test(digits);
}

const BookingPatientPicker = React.forwardRef<
  BookingPatientPickerHandle,
  BookingPatientPickerProps
>(function BookingPatientPicker({ disabled = false, requirePhone = false }, ref) {
  const { t } = useTranslation();

  // ── Search ──
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PatientLookupItem[]>([]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const [searchError, setSearchError] = useState("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reqRef = useRef(0);

  // ── Existing patient ──
  const [selected, setSelected] = useState<PatientLookupItem | null>(null);
  const [profile, setProfile] = useState<SelectedProfile | null>(null);
  const [account, setAccount] = useState<PatientLookupItem | null>(null);

  // ── New walk-in ──
  const [profileName, setProfileName] = useState("");
  const [phone, setPhone] = useState("");
  const [samePerson, setSamePerson] = useState(true);
  const [patientName, setPatientName] = useState("");

  // ── Both ──
  const [age, setAge] = useState("");
  const [gender, setGender] = useState("");
  const [relationship, setRelationship] = useState<PatientRelationship | "">("");

  const [fieldError, setFieldError] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const runSearch = useCallback(
    (q: string) => {
      const token = ++reqRef.current;
      if (q.length < 2) {
        setResults([]);
        setSearched(false);
        setSearching(false);
        return;
      }
      setSearching(true);
      setSearchError("");
      patientsApi
        .lookup({ q })
        .then((res) => {
          if (token !== reqRef.current) return;
          setResults(res.items ?? []);
          setSearched(true);
        })
        .catch((err) => {
          if (token !== reqRef.current) return;
          setResults([]);
          setSearched(true);
          setSearchError(
            err instanceof ApiError ? err.message : t("appointments.patientLookupFailed")
          );
        })
        .finally(() => {
          if (token === reqRef.current) setSearching(false);
        });
    },
    [t]
  );

  const onQueryChange = (value: string) => {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const q = value.trim();
    debounceRef.current = setTimeout(() => runSearch(q), 300);
  };

  // ── Derived ──
  const bookingForOther = !!selected && !!profile && profile.id === selected.id && !samePerson;
  const patientMode: "self" | "member" | "new" | null = !selected
    ? null
    : bookingForOther
      ? "new"
      : profile && profile.id !== selected.id
        ? "member"
        : "self";
  const needsRelationship = selected
    ? bookingForOther || (!!profile && profile.id !== selected.id)
    : !samePerson;
  const ageLocked =
    (patientMode === "self" || patientMode === "member") &&
    selected?.age !== null &&
    selected?.age !== undefined;
  const genderLocked =
    (patientMode === "self" || patientMode === "member") && !!selected?.gender;

  const isMemberSelected = (member: PatientLink) =>
    patientMode === "member" && selected?.id === member.id;

  const genderLabel = (g: string | null | undefined) => {
    if (!g) return "";
    return t(g === "prefer_not_to_say" ? "appointments.preferNotToSay" : `patientDetail.${g}`);
  };
  const relationshipLabel = (rel: string | null | undefined) => {
    const key = RELATIONSHIP_KEYS[(rel ?? "") as PatientRelationship];
    return key ? t(key) : rel ?? "";
  };

  // ── Search & pick ──
  const selectPatient = (
    patient: PatientLookupItem,
    via?: { profile: PatientLookupItem; relationship: string }
  ) => {
    setSelected(patient);
    setSamePerson(true);
    setPatientName("");
    setAge(patient.age != null ? String(patient.age) : "");
    setGender(patient.gender ?? "");
    if (via) {
      setProfile({ id: via.profile.id, name: via.profile.name, phone: via.profile.phone });
      setRelationship(via.relationship as PatientRelationship);
      setAccount(via.profile);
    } else if (patient.phone || patient.profiles.length === 0) {
      setProfile({ id: patient.id, name: patient.name, phone: patient.phone });
      setRelationship("");
      setAccount(patient);
    } else {
      const link = patient.profiles[0];
      setProfile({ id: link.id, name: link.name, phone: link.phone });
      setRelationship(link.relationship as PatientRelationship);
      setAccount(null);
    }
    setQuery("");
    setResults([]);
    setSearched(false);
    setSearchError("");
    setFieldError(null);
  };

  const selectFamilyMember = (profileItem: PatientLookupItem, member: PatientLink) => {
    setSearching(true);
    patientsApi
      .lookup({ q: member.id })
      .then((res) => {
        const full = res.items.find((p) => p.id === member.id);
        if (full) selectPatient(full, { profile: profileItem, relationship: member.relationship });
        else setSearchError(t("apiErrors.code.PATIENT_NOT_FOUND"));
      })
      .catch((err) => {
        setSearchError(
          err instanceof ApiError ? err.message : t("appointments.patientLookupFailed")
        );
      })
      .finally(() => setSearching(false));
  };

  const applySamePerson = (same: boolean) => {
    setSamePerson(same);
    if (same) setRelationship("");
    if (selected) {
      setPatientName("");
      setAge(same ? (selected.age != null ? String(selected.age) : "") : "");
      setGender(same ? selected.gender ?? "" : "");
    }
    setFieldError(null);
  };

  const chooseSelf = () => {
    if (!account || patientMode === "self") return;
    if (selected?.id === account.id) applySamePerson(true);
    else selectPatient(account);
  };
  const chooseMember = (member: PatientLink) => {
    if (!account || isMemberSelected(member)) return;
    selectFamilyMember(account, member);
  };
  const chooseNew = () => {
    if (!account || patientMode === "new") return;
    if (selected?.id !== account.id) selectPatient(account);
    applySamePerson(false);
  };
  const chooseProfile = (link: PatientLink) => {
    if (bookingForOther) applySamePerson(true);
    setAccount(null);
    setProfile({ id: link.id, name: link.name, phone: link.phone });
    setRelationship(link.relationship as PatientRelationship);
    setFieldError(null);
  };
  const chooseOwnProfile = () => {
    if (!selected) return;
    setProfile({ id: selected.id, name: selected.name, phone: selected.phone });
    setAccount(selected);
    setRelationship("");
    setFieldError(null);
  };
  const clearSelection = () => {
    setSelected(null);
    setProfile(null);
    setAccount(null);
    setSamePerson(true);
    setPatientName("");
    setAge("");
    setGender("");
    setRelationship("");
    setFieldError(null);
  };

  const reset = useCallback(() => {
    setQuery("");
    setResults([]);
    setSearching(false);
    setSearched(false);
    setSearchError("");
    setSelected(null);
    setProfile(null);
    setAccount(null);
    setProfileName("");
    setPhone("");
    setSamePerson(true);
    setPatientName("");
    setAge("");
    setGender("");
    setRelationship("");
    setFieldError(null);
  }, []);

  const validateInternal = (): string | null => {
    const ageNum = age.trim() === "" ? null : Number(age);
    if (!selected) {
      if (isBlank(profileName)) return t("appointments.profileNameRequired");
      if (requirePhone || phone.trim() !== "") {
        if (isBlank(phone)) return t("validation.required", { field: t("appointments.profilePhone") });
        if (!isValidMobile(phone)) return t("validation.invalidMobile");
      }
      if (!samePerson && isBlank(patientName)) return t("appointments.patientNameRequired");
    } else if (bookingForOther) {
      if (isBlank(patientName)) return t("appointments.patientNameRequired");
    }
    if (ageNum === null || !Number.isFinite(Number(ageNum))) {
      return t("appointments.patientAgeRequired");
    }
    if (Number(ageNum) < 0 || Number(ageNum) > 150) {
      return t("validation.range", { field: t("appointments.age"), min: 0, max: 150 });
    }
    if (isBlank(gender)) return t("appointments.patientGenderRequired");
    if (needsRelationship && !relationship) return t("appointments.relationshipRequired");
    return null;
  };

  const buildDetails = (): AppointmentPatientDetailsInput => {
    const ageNum = age.trim() === "" ? undefined : Number(age);
    const g = gender || undefined;
    if (selected && bookingForOther) {
      return {
        profile_user_id: selected.id,
        relationship: (relationship || "other") as PatientRelationship,
        name: patientName.trim(),
        phone: selected.phone || undefined,
        age: ageNum ?? null,
        gender: g ?? null,
      };
    }
    if (selected) {
      const isSelf = !profile || profile.id === selected.id;
      return {
        patient_id: selected.id,
        profile_user_id: profile?.id ?? undefined,
        relationship: (isSelf ? "self" : relationship || "other") as PatientRelationship,
        name: selected.name,
        phone: selected.phone || profile?.phone || undefined,
        age: ageNum ?? null,
        gender: g ?? null,
      };
    }
    const pName = profileName.trim();
    return {
      profile_name: pName,
      phone: phone.trim(),
      relationship: (samePerson ? "self" : relationship || "other") as PatientRelationship,
      name: samePerson ? pName : patientName.trim(),
      age: ageNum ?? null,
      gender: g ?? null,
    };
  };

  useImperativeHandle(ref, () => ({
    validate() {
      const err = validateInternal();
      setFieldError(err);
      return err;
    },
    buildDetails,
    reset,
    applyServerError(err, message) {
      const code = err instanceof ApiError ? err.code : "";
      switch (code) {
        case "PHONE_ALREADY_REGISTERED":
          if (selected) return false;
          setFieldError(message);
          return true;
        case "RELATIONSHIP_REQUIRED":
          setFieldError(message);
          return true;
        case "PATIENT_NOT_FOUND":
        case "PROFILE_NOT_FOUND":
          clearSelection();
          return false;
        default:
          return false;
      }
    },
  }));

  const familyLinks = useMemo(() => account?.family ?? [], [account]);

  return (
    <div className="space-y-4">
      {/* Search */}
      {!selected && (
        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
            {t("appointments.selectPatient")}
          </label>
          <input
            type="text"
            value={query}
            disabled={disabled}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder={t("appointments.searchPatientHint")}
            className={inputClass}
          />
          {searching && (
            <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
              {t("common.loading")}
            </p>
          )}
          {!searching && searchError && (
            <p className="mt-2 text-xs text-error-600 dark:text-error-400">{searchError}</p>
          )}
          {!searching && !searchError && searched && results.length === 0 && (
            <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
              {t("appointments.noPatientsFound")}
            </p>
          )}
          {results.length > 0 && (
            <div className="mt-2 max-h-64 space-y-2 overflow-y-auto rounded-xl border border-gray-200 p-2 dark:border-gray-800">
              {results.map((r) => (
                <div
                  key={r.id}
                  className="rounded-lg border border-gray-100 p-3 dark:border-gray-800"
                >
                  <button
                    type="button"
                    onClick={() => selectPatient(r)}
                    className="flex w-full items-center justify-between gap-3 text-left"
                  >
                    <span>
                      <span className="block text-sm font-medium text-gray-800 dark:text-white/90">
                        {r.name}
                      </span>
                      <span className="block text-xs text-gray-500 dark:text-gray-400">
                        {r.patient_code}
                        {r.phone ? ` · ${r.phone}` : ""}
                        {r.age != null ? ` · ${r.age}` : ""}
                        {r.gender ? ` · ${genderLabel(r.gender)}` : ""}
                      </span>
                    </span>
                    {r.is_registered && (
                      <span className="rounded-full bg-success-50 px-2 py-0.5 text-theme-xs font-medium text-success-700 dark:bg-success-500/10 dark:text-success-400">
                        {t("appointments.registeredPatient")}
                      </span>
                    )}
                  </button>
                  {r.family.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {r.family.map((m) => (
                        <button
                          key={`${r.id}-${m.id}`}
                          type="button"
                          onClick={() => selectFamilyMember(r, m)}
                          className="rounded-full border border-gray-200 px-2.5 py-1 text-theme-xs text-gray-600 hover:border-brand-400 dark:border-gray-700 dark:text-gray-300"
                        >
                          {m.name ?? relationshipLabel(m.relationship)}
                          {m.relationship ? ` · ${relationshipLabel(m.relationship)}` : ""}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Selected patient chips */}
      {selected && (
        <div className="rounded-xl border border-gray-200 p-4 dark:border-gray-800">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-theme-xs uppercase tracking-wide text-gray-400">
                {t("appointments.bookingFor")}
              </p>
              <p className="text-sm font-semibold text-gray-800 dark:text-white/90">
                {selected.name}
                {selected.patient_code ? ` · ${selected.patient_code}` : ""}
              </p>
            </div>
            <button
              type="button"
              disabled={disabled}
              onClick={clearSelection}
              className="text-xs font-medium text-brand-500 hover:text-brand-600 dark:text-brand-400"
            >
              {t("appointments.changePatient")}
            </button>
          </div>

          {familyLinks.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={disabled}
                onClick={chooseSelf}
                className={`rounded-full border px-3 py-1 text-theme-xs ${
                  patientMode === "self"
                    ? "border-brand-500 bg-brand-500 text-white"
                    : "border-gray-200 text-gray-600 dark:border-gray-700 dark:text-gray-300"
                }`}
              >
                {t("appointments.relSelf")}
              </button>
              {familyLinks.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  disabled={disabled}
                  onClick={() => chooseMember(m)}
                  className={`rounded-full border px-3 py-1 text-theme-xs ${
                    isMemberSelected(m)
                      ? "border-brand-500 bg-brand-500 text-white"
                      : "border-gray-200 text-gray-600 dark:border-gray-700 dark:text-gray-300"
                  }`}
                >
                  {m.name ?? relationshipLabel(m.relationship)}
                </button>
              ))}
              <button
                type="button"
                disabled={disabled}
                onClick={chooseNew}
                className={`rounded-full border px-3 py-1 text-theme-xs ${
                  patientMode === "new"
                    ? "border-brand-500 bg-brand-500 text-white"
                    : "border-gray-200 text-gray-600 dark:border-gray-700 dark:text-gray-300"
                }`}
              >
                {t("appointments.someoneNew")}
              </button>
            </div>
          )}

          {bookingForOther && (
            <div className="mt-3">
              <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
                {t("appointments.name")} <span className="text-error-500">*</span>
              </label>
              <input
                type="text"
                value={patientName}
                disabled={disabled}
                onChange={(e) => setPatientName(e.target.value)}
                className={inputClass}
              />
            </div>
          )}

          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
                {t("appointments.age")} <span className="text-error-500">*</span>
              </label>
              <input
                type="number"
                min={0}
                max={150}
                value={ageLocked ? selected.age ?? "" : age}
                disabled={disabled || ageLocked}
                onChange={(e) => setAge(e.target.value)}
                className={`${inputClass} disabled:opacity-60`}
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
                {t("appointments.genderLabel")} <span className="text-error-500">*</span>
              </label>
              <select
                value={genderLocked ? selected.gender ?? "" : gender}
                disabled={disabled || genderLocked}
                onChange={(e) => setGender(e.target.value)}
                className={`${inputClass} disabled:opacity-60`}
              >
                <option value="">{t("bookAppointmentModal.preferNotToSay")}</option>
                {["male", "female", "other"].map((g) => (
                  <option key={g} value={g}>
                    {genderLabel(g)}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {needsRelationship && (
            <div className="mt-3">
              <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
                {t("appointments.relationship")} <span className="text-error-500">*</span>
              </label>
              <select
                value={relationship}
                disabled={disabled}
                onChange={(e) => setRelationship(e.target.value as PatientRelationship)}
                className={inputClass}
              >
                <option value="">{t("appointments.selectPatient")}</option>
                {FAMILY_RELATIONSHIPS.map((r) => (
                  <option key={r} value={r}>
                    {relationshipLabel(r)}
                  </option>
                ))}
              </select>
            </div>
          )}

          {selected.profiles.length > 0 && (
            <div className="mt-3">
              <p className="text-theme-xs text-gray-500 dark:text-gray-400">
                {t("appointments.profilePhone")}:
              </p>
              <div className="mt-1 flex flex-wrap gap-2">
                {selected.profiles.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    disabled={disabled}
                    onClick={() => chooseProfile(p)}
                    className={`rounded-full border px-2.5 py-1 text-theme-xs ${
                      profile?.id === p.id && profile.id !== selected.id
                        ? "border-brand-500 text-brand-600 dark:text-brand-400"
                        : "border-gray-200 text-gray-600 dark:border-gray-700 dark:text-gray-300"
                    }`}
                  >
                    {p.phone ?? p.name ?? p.relationship}
                  </button>
                ))}
                <button
                  type="button"
                  disabled={disabled}
                  onClick={chooseOwnProfile}
                  className={`rounded-full border px-2.5 py-1 text-theme-xs ${
                    profile?.id === selected.id
                      ? "border-brand-500 text-brand-600 dark:text-brand-400"
                      : "border-gray-200 text-gray-600 dark:border-gray-700 dark:text-gray-300"
                  }`}
                >
                  {selected.phone ?? t("appointments.relSelf")}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* New walk-in */}
      {!selected && (
        <>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
              {t("appointments.name")} <span className="text-error-500">*</span>
            </label>
            <input
              type="text"
              value={profileName}
              disabled={disabled}
              onChange={(e) => setProfileName(e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
              {t("appointments.phone")} {requirePhone && <span className="text-error-500">*</span>}
            </label>
            <input
              type="tel"
              value={phone}
              disabled={disabled}
              onChange={(e) => setPhone(e.target.value)}
              className={inputClass}
            />
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
            <input
              type="checkbox"
              checked={samePerson}
              disabled={disabled}
              onChange={(e) => applySamePerson(e.target.checked)}
            />
            {t("appointments.sameAsProfile")}
          </label>
          {!samePerson && (
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
                {t("appointments.name")} <span className="text-error-500">*</span>
              </label>
              <input
                type="text"
                value={patientName}
                disabled={disabled}
                onChange={(e) => setPatientName(e.target.value)}
                className={inputClass}
              />
            </div>
          )}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
                {t("appointments.age")} <span className="text-error-500">*</span>
              </label>
              <input
                type="number"
                min={0}
                max={150}
                value={age}
                disabled={disabled}
                onChange={(e) => setAge(e.target.value)}
                className={inputClass}
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
                {t("appointments.genderLabel")} <span className="text-error-500">*</span>
              </label>
              <select
                value={gender}
                disabled={disabled}
                onChange={(e) => setGender(e.target.value)}
                className={inputClass}
              >
                <option value="">{t("bookAppointmentModal.preferNotToSay")}</option>
                {["male", "female", "other"].map((g) => (
                  <option key={g} value={g}>
                    {genderLabel(g)}
                  </option>
                ))}
              </select>
            </div>
          </div>
          {!samePerson && (
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
                {t("appointments.relationship")} <span className="text-error-500">*</span>
              </label>
              <select
                value={relationship}
                disabled={disabled}
                onChange={(e) => setRelationship(e.target.value as PatientRelationship)}
                className={inputClass}
              >
                <option value="">{t("appointments.selectPatient")}</option>
                {FAMILY_RELATIONSHIPS.map((r) => (
                  <option key={r} value={r}>
                    {relationshipLabel(r)}
                  </option>
                ))}
              </select>
            </div>
          )}
        </>
      )}

      {fieldError && (
        <p className="text-xs text-error-600 dark:text-error-400">{fieldError}</p>
      )}
    </div>
  );
});

export default BookingPatientPicker;
