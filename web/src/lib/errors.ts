import { BaseError, ContractFunctionRevertedError, UserRejectedRequestError } from "viem";
import { fmtMusd, fmtRatio } from "./format";

const messages: Record<string, (args: readonly unknown[]) => string> = {
  TroveAlreadyActive: () => "You already have an open micro trove.",
  TroveNotActive: () => "No open micro trove for this wallet.",
  ZeroAmount: () => "Enter an amount above zero.",
  AmountExceedsCollateral: () => "That is more BTC than the trove holds.",
  DebtBelowMinimum: ([debt, min]) =>
    `Debt would be ${fmtMusd(debt as bigint)} MUSD. It must be 0 or at least ${fmtMusd(min as bigint)}.`,
  DebtAboveMaximum: ([debt, max]) =>
    `Debt would be ${fmtMusd(debt as bigint)} MUSD, above the ${fmtMusd(max as bigint)} MUSD limit.`,
  CollateralBelowMinimum: () => "Collateral is below the minimum trove size.",
  CollateralRatioBelowMinimum: ([icr]) =>
    `Collateral ratio would be ${fmtRatio(icr as bigint)}, below the 110% minimum.`,
  CollateralRatioAboveMaximum: ([icr]) =>
    `Collateral ratio would be ${fmtRatio(icr as bigint)}, above the 500% cap. Borrow more or add less BTC.`,
  TermEnded: () => "This loan has matured. Repay it before borrowing again.",
  DebtOutstanding: () => "Repay the debt before withdrawing all collateral.",
  NotLiquidatable: () => "This trove is healthy and not yet matured.",
  NothingToClaim: () => "Nothing to claim.",
  PromotionShortfall: ([received, owed]) =>
    `The MUSD trove would pay ${fmtMusd(received as bigint)} MUSD but the micro loan owes ${fmtMusd(owed as bigint)}.`,
  InsufficientLiquidity: ([, available]) =>
    `The vault only has ${fmtMusd(available as bigint)} MUSD available to lend right now.`,
  EnforcedPause: () => "New borrowing is paused. Repaying and closing still work.",
  ERC4626ExceededMaxWithdraw: () => "Not enough idle MUSD for an instant withdrawal. Queue it instead.",
  ERC4626ExceededMaxRedeem: () => "Not enough idle MUSD for an instant withdrawal. Queue it instead.",
  ERC20InsufficientBalance: () => "Insufficient balance.",
  NotRequestOwner: () => "That request belongs to another wallet.",
  RequestClosed: () => "That request is already filled or cancelled.",
};

export function errorMessage(error: unknown): string {
  if (error instanceof BaseError) {
    if (error.walk((e) => e instanceof UserRejectedRequestError)) return "Request rejected in wallet.";
    const revert = error.walk((e) => e instanceof ContractFunctionRevertedError);
    if (revert instanceof ContractFunctionRevertedError) {
      const name = revert.data?.errorName;
      if (name && messages[name]) return messages[name](revert.data?.args ?? []);
      if (revert.reason) return revert.reason;
      if (name) return name;
    }
    return error.shortMessage;
  }
  if (error instanceof Error) return error.message;
  return String(error);
}
