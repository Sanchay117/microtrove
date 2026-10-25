import type { Address } from "viem";
import { fmtMusd, fmtUsd } from "./format.ts";

export const ONE = 10n ** 18n;

// Microtroves.LiquidationMode
export const Mode = { None: 0, Undercollateralized: 1, Expired: 2 } as const;
export const MODE_NAMES = ["healthy", "below minimum", "matured"] as const;

export type Preview = {
  mode: number;
  debt: bigint;
  repayAmount: bigint;
  collateralToLiquidator: bigint;
  surplus: bigint;
};

export type Candidate = { borrower: Address; preview: Preview };

export type Scored = Candidate & {
  /** MUSD to budget for: the repayment plus a margin for interest that accrues before inclusion. */
  maxRepay: bigint;
  /** Value of the BTC received at the oracle price, in MUSD. */
  reward: bigint;
  /** reward - repayment - gas, in MUSD. */
  profit: bigint;
};

export type Plan = {
  liquidate: Scored[];
  skipped: (Scored & { reason: string })[];
};

/** A 0.1% margin covers far more interest than accrues between a scan and inclusion. */
export const withMargin = (repay: bigint) => (repay * 1_001n) / 1_000n;

/**
 * Picks which liquidatable troves to liquidate this scan. Troves below the minimum
 * ratio go first because lenders carry their risk, then the most profitable ones,
 * within the keeper's MUSD and the per-scan limit.
 */
export function plan({ candidates, price, musdBalance, gasCost, minProfit, maxPerTick }: {
  candidates: Candidate[];
  price: bigint;
  musdBalance: bigint;
  gasCost: bigint;
  minProfit: bigint;
  maxPerTick: number;
}): Plan {
  const scored = candidates
    .filter((c) => c.preview.mode !== Mode.None)
    .map((c): Scored => {
      const reward = (c.preview.collateralToLiquidator * price) / ONE;
      return { ...c, maxRepay: withMargin(c.preview.repayAmount), reward, profit: reward - c.preview.repayAmount - gasCost };
    })
    .sort((a, b) => a.preview.mode - b.preview.mode || (a.profit > b.profit ? -1 : a.profit < b.profit ? 1 : 0));

  const result: Plan = { liquidate: [], skipped: [] };
  let budget = musdBalance;
  for (const c of scored) {
    if (c.profit < minProfit) {
      result.skipped.push({ ...c, reason: `earns ${fmtUsd(c.profit)} after gas, below the minimum` });
    } else if (result.liquidate.length >= maxPerTick) {
      result.skipped.push({ ...c, reason: "per-scan limit reached" });
    } else if (c.maxRepay > budget) {
      result.skipped.push({ ...c, reason: `needs ${fmtMusd(c.maxRepay)} MUSD, keeper has ${fmtMusd(budget)}` });
    } else {
      budget -= c.maxRepay;
      result.liquidate.push(c);
    }
  }
  return result;
}
