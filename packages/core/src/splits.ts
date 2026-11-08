/**
 * Split and transfer rules shared by every layer (repository, editor, import). Pure, integer minor units only.
 */

export interface SplitLike {
  amount: number;
}

/** Sum of the split amounts. Exact: integers never lose precision below 2^53. */
export function splitsTotal(splits: readonly SplitLike[]): number {
  return splits.reduce((sum, s) => sum + s.amount, 0);
}

/** What is still unallocated: `total` minus the splits. 0 means the splits are complete. */
export function splitsRemaining(total: number, splits: readonly SplitLike[]): number {
  return total - splitsTotal(splits);
}

/**
 * Why `splits` are not valid for a transaction of `total`, or `null` when they are. No splits is valid
 * (the transaction has a single category). Otherwise every amount is a safe integer and they sum to `total` exactly.
 */
export function splitsError(total: number, splits: readonly SplitLike[]): string | null {
  if (splits.length === 0) return null;
  if (splits.some((s) => !Number.isSafeInteger(s.amount))) {
    return "Split amounts must be whole minor units";
  }
  const remaining = splitsRemaining(total, splits);
  if (remaining !== 0) {
    return `Splits add up to ${splitsTotal(splits)} but the transaction is ${total}`;
  }
  return null;
}

/**
 * The two legs of a transfer of `amount` (a positive amount in minor units): the source account loses it,
 * the destination gains it. Transfers are two linked transactions that always cancel out.
 */
export function transferLegs(amount: number): { from: number; to: number } {
  if (!Number.isSafeInteger(amount) || amount <= 0) {
    throw new RangeError("A transfer amount must be a positive whole number of minor units");
  }
  return { from: -amount, to: amount };
}
