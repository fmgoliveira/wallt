export interface OnboardingState {
  hasAccount: boolean;
  hasTransactions: boolean;
  /** Both required steps are done: nothing left to guide. */
  finished: boolean;
}

/** Which first-run steps are done, from the number of accounts and transactions the user has. */
export function onboardingSteps(counts: {
  accounts: number;
  transactions: number;
}): OnboardingState {
  const hasAccount = counts.accounts > 0;
  const hasTransactions = counts.transactions > 0;
  return { hasAccount, hasTransactions, finished: hasAccount && hasTransactions };
}
