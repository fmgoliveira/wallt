export const LANGUAGES = ["en", "pt"] as const;
export type Language = (typeof LANGUAGES)[number];
export type LanguagePreference = "system" | Language;

export const FALLBACK_LANGUAGE: Language = "en";

export function isLanguagePreference(v: unknown): v is LanguagePreference {
  return v === "system" || v === "en" || v === "pt";
}

/** First device locale (BCP 47, e.g. "pt-PT") whose language we ship; English otherwise. */
export function resolveLanguage(
  preference: LanguagePreference,
  deviceLocales: readonly string[],
): Language {
  if (preference !== "system") return preference;
  for (const tag of deviceLocales) {
    const base = tag.toLowerCase().split(/[-_]/)[0];
    const hit = LANGUAGES.find((l) => l === base);
    if (hit) return hit;
  }
  return FALLBACK_LANGUAGE;
}
