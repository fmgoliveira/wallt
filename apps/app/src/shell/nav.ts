import type { LucideIcon } from "lucide-react-native";
import {
  ArrowLeftRight,
  ChartColumn,
  Ellipsis,
  LayoutDashboard,
  PiggyBank,
  Repeat,
  Settings,
  Target,
  Upload,
  Wallet,
} from "lucide-react-native";
import type { Catalogue } from "../i18n/locales/en";

export interface NavItem {
  key: string;
  /** Key in the `nav` catalogue (translated at render time). */
  label: keyof Catalogue["nav"];
  /** Shorter label for the phone tab bar, where width is tight. */
  shortLabel?: keyof Catalogue["nav"];
  href: string;
  icon: LucideIcon;
}

export const dashboard: NavItem = {
  key: "dashboard",
  label: "dashboard",
  href: "/",
  icon: LayoutDashboard,
};
export const transactions: NavItem = {
  key: "transactions",
  label: "transactions",
  shortLabel: "transactionsShort",
  href: "/transactions",
  icon: ArrowLeftRight,
};
export const accounts: NavItem = {
  key: "accounts",
  label: "accounts",
  href: "/accounts",
  icon: Wallet,
};
export const budgets: NavItem = {
  key: "budgets",
  label: "budgets",
  href: "/budgets",
  icon: PiggyBank,
};
export const recurring: NavItem = {
  key: "recurring",
  label: "recurring",
  href: "/recurring",
  icon: Repeat,
};
export const goals: NavItem = {
  key: "goals",
  label: "goals",
  shortLabel: "goalsShort",
  href: "/goals",
  icon: Target,
};
export const reports: NavItem = {
  key: "reports",
  label: "reports",
  href: "/reports",
  icon: ChartColumn,
};
export const importItem: NavItem = {
  key: "import",
  label: "import",
  href: "/import",
  icon: Upload,
};
export const settings: NavItem = {
  key: "settings",
  label: "settings",
  href: "/settings",
  icon: Settings,
};
export const more: NavItem = { key: "more", label: "more", href: "/more", icon: Ellipsis };

/**
 * Phone tab bar (plan §9.2, guidelines §7): two tabs, the add button in the middle, two tabs.
 * Budgets, Reports and Settings live under "More".
 */
export const phoneItems: readonly NavItem[] = [dashboard, transactions, accounts, more];

/** Rail (tablet) and sidebar (desktop) show every destination. */
export const wideItems: readonly NavItem[] = [
  dashboard,
  transactions,
  accounts,
  budgets,
  recurring,
  goals,
  reports,
  importItem,
  settings,
];

/** Routes reached through "More" on phones. */
export const moreItems: readonly NavItem[] = [
  budgets,
  recurring,
  goals,
  reports,
  importItem,
  settings,
];

export function isActive(item: NavItem, pathname: string): boolean {
  if (item.href === "/") return pathname === "/";
  if (
    item.key === "settings" &&
    (pathname.startsWith("/categories") ||
      pathname.startsWith("/import-formats") ||
      pathname.startsWith("/rules") ||
      pathname.startsWith("/payee-names"))
  )
    return true;
  if (item.key === "more")
    return moreItems.some((m) => isActive(m, pathname)) || pathname === "/more";
  if (item.key === "transactions" && pathname.startsWith("/review")) return true;
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}
