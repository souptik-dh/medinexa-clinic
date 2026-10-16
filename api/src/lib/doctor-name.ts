// Doctor names are stored without a title in doctors.name; the title lives in
// doctors.name_prefix (default "Dr."). Every API response shows the titled name
// ("Dr. Riya Sen") — doctor objects' `name` and every `doctor_name` — and doctor
// objects also carry `name_prefix`. Writes strip a leading "Dr." (forms send the
// titled name back), so the title is never stored twice.

export const DEFAULT_DOCTOR_PREFIX = "Dr.";

// "Dr", "Dr.", "dr ", "DR." … at the start of a name, possibly repeated.
const LEADING_DR = /^(?:dr\.?(?:\s+|$)|dr\.(?=\S))+/i;

/** "Dr. Riya Sen" → "Riya Sen". Leaves names without a leading Dr. untouched. */
export function stripDoctorPrefix(name: string): string {
  return name.trim().replace(LEADING_DR, "").trim();
}

/**
 * "Riya Sen" → "Dr. Riya Sen". Idempotent: an already titled "Dr. Riya Sen" stays as
 * is. Empty input gives "" so it is safe inside message templates.
 */
export function formatDoctorName(name: string | null | undefined, prefix: string | null = DEFAULT_DOCTOR_PREFIX): string {
  if (name === null || name === undefined) return "";
  const plain = stripDoctorPrefix(String(name));
  if (!plain) return "";
  const title = (prefix ?? "").trim();
  return title ? `${title} ${plain}` : plain;
}

/** SQL for the titled name of the doctors row aliased `alias`, e.g. `${doctorNameSql()} AS doctor_name`. */
export function doctorNameSql(alias = "d"): string {
  return `CONCAT_WS(' ', NULLIF(TRIM(${alias}.name_prefix), ''), ${alias}.name)`;
}
