import type { Category } from "@wallt/core";

export interface CategoryOption {
  value: string;
  label: string;
}

/**
 * Flat picker options for one type: each top-level category followed by its subcategories ("Parent › Child").
 * Archived categories are hidden unless one is currently selected (`keepId`), so history stays editable.
 */
export function categoryOptions(
  all: readonly Category[],
  type: Category["type"],
  keepId?: string | null,
): CategoryOption[] {
  const usable = all.filter((c) => c.type === type && (!c.archived || c.id === keepId));
  const out: CategoryOption[] = [];
  for (const root of usable.filter((c) => c.parentId === null)) {
    out.push({ value: root.id, label: root.name });
    for (const child of usable.filter((c) => c.parentId === root.id)) {
      out.push({ value: child.id, label: `${root.name} › ${child.name}` });
    }
  }
  // A kept category whose parent is archived or of another listing still needs to appear.
  if (keepId && !out.some((o) => o.value === keepId)) {
    const kept = all.find((c) => c.id === keepId);
    if (kept) out.push({ value: kept.id, label: kept.name });
  }
  return out;
}
