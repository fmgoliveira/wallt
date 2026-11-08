import { type Account, currencyExponent } from "@wallt/core";
import { type CategoryColorName, type ColorScheme, categoryPalette } from "@wallt/ui";
import type { LucideIcon } from "lucide-react-native";
import { Banknote, CreditCard, Landmark, PiggyBank, TrendingUp, Wallet } from "lucide-react-native";

export type AccountType = Account["type"];

export const accountTypes: readonly { value: AccountType; label: string; description?: string }[] =
  [
    { value: "checking", label: "Checking", description: "Everyday account" },
    { value: "savings", label: "Savings" },
    { value: "credit_card", label: "Credit card", description: "Balance is usually negative" },
    { value: "cash", label: "Cash" },
    { value: "investment", label: "Investment" },
    { value: "other", label: "Other" },
  ];

export const accountTypeLabel = (type: AccountType): string =>
  accountTypes.find((t) => t.value === type)?.label ?? type;

export const accountTypeIcon: Record<AccountType, LucideIcon> = {
  checking: Landmark,
  savings: PiggyBank,
  credit_card: CreditCard,
  cash: Banknote,
  investment: TrendingUp,
  other: Wallet,
};

/** Common currencies for the picker (any ISO 4217 code is valid in the data layer). */
export const currencies = ["EUR", "USD", "GBP", "CHF", "BRL", "JPY"] as const;

export const currencyOptions = currencies.map((c) => ({
  value: c,
  label: c,
  description: `${currencyExponent(c)} decimal places`,
}));

/** Accounts store a single hex. We store the palette's light shade and re-map it to the active scheme for display. */
export const accountColorNames = Object.keys(categoryPalette) as CategoryColorName[];

export const accountColorHex = (name: CategoryColorName): string => categoryPalette[name].light;

export function accountColorName(hex: string | null): CategoryColorName | null {
  if (!hex) return null;
  const lower = hex.toLowerCase();
  return (
    accountColorNames.find(
      (n) => categoryPalette[n].light === lower || categoryPalette[n].dark === lower,
    ) ?? null
  );
}

/** The stored hex re-mapped to the scheme's contrast-checked shade (falls back to the raw hex). */
export function accountColorForScheme(hex: string | null, scheme: ColorScheme): string | null {
  const name = accountColorName(hex);
  return name ? categoryPalette[name][scheme] : hex;
}
