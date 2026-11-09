export const stripAccents = (s: string): string => s.normalize("NFD").replace(/[̀-ͯ]/g, "");

/** Lowercase, accents removed, punctuation turned into single spaces: the form rules and memory compare in. */
export function normalizeText(s: string): string {
  return stripAccents(s)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}
