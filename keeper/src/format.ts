import { BaseError, ContractFunctionRevertedError, formatUnits } from "viem";

const amount = (x: bigint, maxDigits: number) =>
  Number(formatUnits(x, 18)).toLocaleString("en-US", {
    minimumFractionDigits: Math.min(2, maxDigits),
    maximumFractionDigits: maxDigits,
  });

export const fmtMusd = (x: bigint) => amount(x, 2);
export const fmtBtc = (x: bigint) => amount(x, 8);
export const fmtUsd = (x: bigint) => (x < 0n ? `-$${amount(-x, 2)}` : `$${amount(x, 2)}`);
export const shortAddr = (a: string) => `${a.slice(0, 6)}...${a.slice(-4)}`;

/** One line for a log, preferring viem's short message and the decoded revert reason. */
export function describe(err: unknown): string {
  if (err instanceof BaseError) {
    const revert = err.walk((e) => e instanceof ContractFunctionRevertedError);
    if (revert instanceof ContractFunctionRevertedError) {
      return `reverts with ${revert.data?.errorName ?? revert.reason ?? "no reason"}`;
    }
    return err.shortMessage.split("\n")[0];
  }
  if (err instanceof Error) return err.message.split("\n")[0];
  return String(err);
}

const stamp = () => new Date().toISOString().replace(/\.\d+Z$/, "Z");

export const log = {
  info: (msg: string) => console.log(`${stamp()}  ${msg}`),
  warn: (msg: string) => console.warn(`${stamp()}  warn: ${msg}`),
  error: (msg: string) => console.error(`${stamp()}  error: ${msg}`),
};
