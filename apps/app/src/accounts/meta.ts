import { type Account, currencyExponent } from "@wallt/core";
import type { LucideIcon } from "lucide-react-native";
import { Banknote, CreditCard, Landmark, PiggyBank, TrendingUp, Wallet } from "lucide-react-native";
import { i18n } from "../i18n";

export type AccountType = Account["type"];

/** Labels are getters so they resolve in the current language each time a picker renders. */
export const accountTypes: readonly { value: AccountType; label: string; description?: string }[] =
  [
    {
      value: "checking",
      get label() {
        return i18n.t("accounts.types.checking");
      },
      get description() {
        return i18n.t("accounts.types.checkingHint");
      },
    },
    {
      value: "savings",
      get label() {
        return i18n.t("accounts.types.savings");
      },
    },
    {
      value: "credit_card",
      get label() {
        return i18n.t("accounts.types.creditCard");
      },
      get description() {
        return i18n.t("accounts.types.creditCardHint");
      },
    },
    {
      value: "cash",
      get label() {
        return i18n.t("accounts.types.cash");
      },
    },
    {
      value: "investment",
      get label() {
        return i18n.t("accounts.types.investment");
      },
    },
    {
      value: "other",
      get label() {
        return i18n.t("accounts.types.other");
      },
    },
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
  get description() {
    return i18n.t("accounts.decimals", { n: currencyExponent(c) });
  },
}));
