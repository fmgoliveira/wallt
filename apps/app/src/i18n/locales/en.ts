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
} as const;

export type Catalogue = typeof en;
