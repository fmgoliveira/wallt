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
  Wallet,
} from "lucide-react-native";

export interface NavItem {
  key: string;
  label: string;
  /** Shorter label for the phone tab bar, where width is tight. */
  shortLabel?: string;
  href: string;
  icon: LucideIcon;
}

export const dashboard: NavItem = {
  key: "dashboard",
  label: "Dashboard",
  href: "/",
  icon: LayoutDashboard,
};
export const transactions: NavItem = {
  key: "transactions",
  label: "Transactions",
  shortLabel: "Activity",
  href: "/transactions",
  icon: ArrowLeftRight,
};
export const accounts: NavItem = {
  key: "accounts",
  label: "Accounts",
  href: "/accounts",
  icon: Wallet,
};
export const budgets: NavItem = {
  key: "budgets",
  label: "Budgets",
  href: "/budgets",
  icon: PiggyBank,
};
export const recurring: NavItem = {
  key: "recurring",
  label: "Recurring",
  href: "/recurring",
  icon: Repeat,
};
export const goals: NavItem = {
  key: "goals",
  label: "Goals & debts",
  shortLabel: "Goals",
  href: "/goals",
  icon: Target,
};
export const reports: NavItem = {
  key: "reports",
  label: "Reports",
  href: "/reports",
  icon: ChartColumn,
};
export const settings: NavItem = {
  key: "settings",
  label: "Settings",
  href: "/settings",
  icon: Settings,
};
export const more: NavItem = { key: "more", label: "More", href: "/more", icon: Ellipsis };

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
  settings,
];

/** Routes reached through "More" on phones. */
export const moreItems: readonly NavItem[] = [budgets, recurring, goals, reports, settings];

export function isActive(item: NavItem, pathname: string): boolean {
  if (item.href === "/") return pathname === "/";
  if (item.key === "settings" && pathname.startsWith("/categories")) return true;
  if (item.key === "more")
    return moreItems.some((m) => isActive(m, pathname)) || pathname === "/more";
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}
