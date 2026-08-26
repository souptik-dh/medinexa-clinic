/**
 * Doctor `specialization` fields are a comma-joined display string derived
 * from a doctor's assigned specializations (e.g. "Cardiologist, General Physician").
 * These helpers let search/filter code match against each individual name
 * instead of requiring the whole joined string to match exactly.
 */

export function splitSpecializations(value?: string | null): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Distinct individual specialization names across a list of doctors, case-insensitively deduped. */
export function getSpecializationOptions<T extends { specialization?: string | null }>(
  items: T[]
): string[] {
  const seen = new Map<string, string>();
  items.forEach((item) => {
    splitSpecializations(item.specialization).forEach((name) => {
      const key = name.toLowerCase();
      if (!seen.has(key)) seen.set(key, name);
    });
  });
  return Array.from(seen.values()).sort((a, b) => a.localeCompare(b));
}

/**
 * True if `specialization` shares at least one individual name (case-insensitive)
 * with `selected` — i.e. OR-logic multi-select matching. An empty `selected`
 * list means "no filter applied" and matches everything.
 */
export function matchesSpecializationFilter(
  specialization: string | null | undefined,
  selected: string[]
): boolean {
  if (selected.length === 0) return true;
  const parts = splitSpecializations(specialization).map((s) => s.toLowerCase());
  const selectedLower = selected.map((s) => s.toLowerCase());
  return parts.some((p) => selectedLower.includes(p));
}
