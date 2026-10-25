import { getAddress, parseUnits, type Hex } from "viem";
import deployment from "../../deployments/mezo-testnet.json" with { type: "json" };

function env(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

function count(name: string, fallback: number): number {
  const raw = env(name);
  if (raw === undefined) return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) throw new Error(`${name} must be a positive whole number, got "${raw}"`);
  return n;
}

function musd(name: string, fallback: string): bigint {
  const raw = env(name) ?? fallback;
  if (!/^\d+(\.\d{1,18})?$/.test(raw)) throw new Error(`${name} must be a plain decimal amount, got "${raw}"`);
  return parseUnits(raw, 18);
}

const privateKey = env("KEEPER_PRIVATE_KEY");
if (privateKey && !/^0x[0-9a-fA-F]{64}$/.test(privateKey)) {
  throw new Error("KEEPER_PRIVATE_KEY must be a 0x-prefixed 32-byte hex key");
}

export const config = {
  chainId: deployment.chainId,
  rpcUrl: env("RPC_URL") ?? deployment.rpcUrl,
  explorer: deployment.explorer,
  loanBook: getAddress(deployment.contracts.Microtroves),
  vault: getAddress(deployment.contracts.MicrotroveVault),
  musd: getAddress(deployment.mezo.MUSD),
  priceFeed: getAddress(deployment.mezo.PriceFeed),
  privateKey: privateKey as Hex | undefined,
  pollMs: count("POLL_SECONDS", 30) * 1_000,
  minProfit: musd("MIN_PROFIT_MUSD", "0.01"),
  maxPerTick: count("MAX_PER_TICK", 10),
  processQueue: env("PROCESS_QUEUE") !== "false",
  once: process.argv.includes("--once"),
  // Without a key there is nothing to sign with, so the keeper only reports.
  dryRun: process.argv.includes("--dry-run") || !privateKey,
};
