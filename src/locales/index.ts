import en from "./en";
import bn from "./bn";

export type Locale = "en" | "bn";

export const locales: Locale[] = ["en", "bn"];

export const translations: Record<Locale, typeof en> = { en, bn };
