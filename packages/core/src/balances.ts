import { type Money, money, sum } from "./money";

/** The fields net worth needs from an account with its derived balance. */
export interface NetWorthItem {
  currency: string;
  balance: number;
  includeInNetWorth: boolean;
  archived: boolean;
}

/**
 * Net worth per currency, in first-seen currency order. Accounts that are archived or opted out
 * (`includeInNetWorth = false`) do not count. No cross-currency conversion here: that arrives with FX (P4.5).
 */
export function netWorthByCurrency(accounts: readonly NetWorthItem[]): Money[] {
  const counted = accounts.filter((a) => a.includeInNetWorth && !a.archived);
  const currencies = [...new Set(counted.map((a) => a.currency))];
  return currencies.map((currency) =>
    sum(
      counted.filter((a) => a.currency === currency).map((a) => money(a.balance, currency)),
      currency,
    ),
  );
}
