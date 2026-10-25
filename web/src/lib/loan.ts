import type { Params } from "../hooks/useProtocol";
import type { Trove } from "../hooks/useAccountState";
import { BPS, feeFor, interestFor } from "./math";

// Left in the wallet for gas when using Max on BTC inputs.
export const GAS_RESERVE = 10n ** 13n;

/** Largest borrow whose debt including the issuance fee stays within maxDebt. */
export function maxBorrowFor(params: Params, principal = 0n) {
  const room = params.maxDebt - principal;
  if (room <= 0n) return 0n;
  let amount = (room * BPS) / (BPS + params.issuanceFeeBps);
  while (amount > 0n && amount + feeFor(amount, params.issuanceFeeBps) > room) amount -= 1n;
  return amount;
}

/** Debt plus an hour of interest, so a full repayment still covers interest accrued before it lands. */
export const debtWithBuffer = (t: Trove) => t.debt + interestFor(t.principal, t.interestRateBps, 3_600n) + 1n;
