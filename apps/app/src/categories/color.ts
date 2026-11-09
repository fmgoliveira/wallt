import type { Category } from "@wallt/core";
import type { ColorScheme } from "@wallt/ui";
import { displayColor } from "../components/colors";

/**
 * Colour of a category: its own, else its parent's, else a stable default seeded by the top-level category's
 * `systemKey` (identical on every device, unlike random ids) or id.
 */
export function categoryTint(
  category: Category | undefined,
  all: readonly Category[],
  scheme: ColorScheme,
): string {
  if (!category) return displayColor(null, "none", scheme);
  const parent = category.parentId ? all.find((c) => c.id === category.parentId) : undefined;
  const root = parent ?? category;
  const own = category.color ?? parent?.color ?? null;
  return displayColor(own, root.systemKey ?? root.id, scheme);
}
