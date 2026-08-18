export const PHONE_REGEX = /^\d{10}$/;

export const PHONE_VALIDATION_MESSAGE = "Phone number must be exactly 10 digits.";

export function sanitizePhoneDigits(raw: string): string {
  return raw.replace(/\D/g, "").slice(0, 10);
}

export function isValidPhone(value: string): boolean {
  return PHONE_REGEX.test(value);
}
