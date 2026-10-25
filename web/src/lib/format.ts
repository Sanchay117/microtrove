import { formatUnits, parseUnits } from "viem";

const toNumber = (value: bigint, decimals = 18) => Number(formatUnits(value, decimals));

const fixed = (n: number, min: number, max: number) =>
  n.toLocaleString("en-US", { minimumFractionDigits: Math.min(min, max), maximumFractionDigits: max });

export const fmtBtc = (wei: bigint | undefined, max = 6) =>
  wei === undefined ? "-" : fixed(toNumber(wei), 2, max);

export const fmtMusd = (wei: bigint | undefined, max = 2) =>
  wei === undefined ? "-" : fixed(toNumber(wei), 2, max);

export const fmtUsd = (wei: bigint | undefined) =>
  wei === undefined ? "-" : `$${fixed(toNumber(wei), 2, 2)}`;

export const fmtPrice = (wei: bigint | undefined) =>
  wei === undefined ? "-" : `$${fixed(toNumber(wei), 0, 0)}`;

/** Ratio with 1e18 = 100%. */
export const fmtRatio = (ratio: bigint | undefined, digits = 1) =>
  ratio === undefined ? "-" : `${fixed(toNumber(ratio) * 100, digits, digits)}%`;

export const fmtBps = (bps: bigint | number | undefined, digits = 2) =>
  bps === undefined ? "-" : `${fixed(Number(bps) / 100, 0, digits)}%`;

export const shortAddr = (address: string) => `${address.slice(0, 6)}...${address.slice(-4)}`;

export const fmtDate = (unix: bigint | number) =>
  new Date(Number(unix) * 1000).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

export function fmtDuration(seconds: number) {
  if (seconds <= 0) return "now";
  const d = Math.floor(seconds / 86_400);
  const h = Math.floor((seconds % 86_400) / 3_600);
  const m = Math.floor((seconds % 3_600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m`;
  return `${Math.floor(seconds)}s`;
}

/** Parses user input into 18-decimal units; undefined for empty or invalid input. */
export function parseAmount(input: string, decimals = 18): bigint | undefined {
  const clean = input.trim().replace(/,/g, "");
  if (!/^\d*\.?\d*$/.test(clean) || clean === "" || clean === ".") return undefined;
  try {
    return parseUnits(clean, decimals);
  } catch {
    return undefined;
  }
}

/** Plain decimal string for prefilling inputs. */
export const toInput = (wei: bigint, max = 6) => {
  const s = formatUnits(wei, 18);
  const [whole, frac = ""] = s.split(".");
  const trimmed = frac.slice(0, max).replace(/0+$/, "");
  return trimmed ? `${whole}.${trimmed}` : whole;
};
