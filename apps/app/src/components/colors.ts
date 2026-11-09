import { type CategoryColorName, type ColorScheme, categoryPalette } from "@wallt/ui";

/**
 * Accounts, categories and tags store one hex. We store the palette's light shade and re-map it to the active
 * scheme's contrast-checked shade for display.
 */
export const paletteNames = Object.keys(categoryPalette) as CategoryColorName[];

export const paletteHex = (name: CategoryColorName): string => categoryPalette[name].light;

export function paletteName(hex: string | null): CategoryColorName | null {
  if (!hex) return null;
  const lower = hex.toLowerCase();
  return (
    paletteNames.find(
      (n) => categoryPalette[n].light === lower || categoryPalette[n].dark === lower,
    ) ?? null
  );
}

/** The stored hex re-mapped to the scheme's shade (falls back to the raw hex, or null when unset). */
export function colorForScheme(hex: string | null, scheme: ColorScheme): string | null {
  const name = paletteName(hex);
  return name ? categoryPalette[name][scheme] : hex;
}

/** Stable palette colour for something that has none stored: the same seed always gives the same colour. */
export function fallbackColorName(seed: string): CategoryColorName {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  return paletteNames[hash % paletteNames.length] ?? "sky";
}

/**
 * Colour to draw for an account/category: the one the user picked, else a stable default derived from `seed`
 * (nothing is written to the database, and the user can still choose their own).
 */
export function displayColor(hex: string | null, seed: string, scheme: ColorScheme): string {
  return colorForScheme(hex, scheme) ?? categoryPalette[fallbackColorName(seed)][scheme];
}
