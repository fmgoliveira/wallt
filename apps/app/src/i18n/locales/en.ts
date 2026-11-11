import { accounts } from "./en/accounts";
import { aliases } from "./en/aliases";
import { budgets } from "./en/budgets";
import { categories } from "./en/categories";
import { common } from "./en/common";
import { dashboard } from "./en/dashboard";
import { goals } from "./en/goals";
import { importing } from "./en/importing";
import { notifications } from "./en/notifications";
import { onboarding } from "./en/onboarding";
import { recurring } from "./en/recurring";
import { reports } from "./en/reports";
import { review } from "./en/review";
import { rules } from "./en/rules";
import { security } from "./en/security";
import { shared } from "./en/shared";
import { sync } from "./en/sync";
import { transactions } from "./en/transactions";
import { yourData } from "./en/yourData";

/** English is the source catalogue; Portuguese must have exactly the same keys (enforced by its type). */
export const en = {
  nav: {
    dashboard: "Dashboard",
    transactions: "Transactions",
    transactionsShort: "Activity",
    accounts: "Accounts",
    budgets: "Budgets",
    recurring: "Recurring",
    goals: "Goals & debts",
    goalsShort: "Goals",
    reports: "Reports",
    import: "Import",
    settings: "Settings",
    more: "More",
  },
  settings: {
    title: "Settings",
    subtitle: "Language, security, categories, rules; theme, currency and backups later",
    categories: "Categories",
    categoriesHint: "Names, icons, colours and order",
    rules: "Rules",
    rulesHint: "Categorise transactions automatically",
    payeeNames: "Payee names",
    payeeNamesHint: "Clean up how shops and people are named",
    importFormats: "Import formats",
    importFormatsHint: "How each bank's export is read",
  },
  language: {
    title: "Language",
    hint: "Applies to menus and messages. Names you typed yourself (accounts, categories) are not translated.",
    system: "Device",
    en: "English",
    pt: "Português",
  },
  transactions,
  importing,
  review,
  rules,
  aliases,
  dashboard,
  reports,
  budgets,
  accounts,
  categories,
  goals,
  recurring,
  security,
  notifications,
  sync,
  common,
  shared,
  onboarding,
  yourData,
} as const;

export type Catalogue = typeof en;
/** Same shape as the catalogue with plain `string` leaves, so translations are not forced to equal English. */
export type Widen<T> = { [K in keyof T]: T[K] extends string ? string : Widen<T[K]> };
