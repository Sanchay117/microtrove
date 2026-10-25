import { useReadContract, useReadContracts } from "wagmi";
import { addresses } from "../config";
import { microtrovesAbi } from "../abi/Microtroves";
import { vaultAbi } from "../abi/MicrotroveVault";
import { priceFeedAbi } from "../abi/mezo";

export const loans = { address: addresses.loans, abi: microtrovesAbi } as const;
export const vault = { address: addresses.vault, abi: vaultAbi } as const;

export type Params = {
  interestRateBps: bigint;
  issuanceFeeBps: bigint;
  term: bigint;
  minDebt: bigint;
  maxDebt: bigint;
  mcr: bigint;
  maxCr: bigint;
  expiryBonusBps: bigint;
  underwaterBonusBps: bigint;
  protocolFeeBps: bigint;
};

/** BTC/USD from MUSD's PriceFeed, kept separate so a stale oracle does not blank the app. */
export function usePrice() {
  const q = useReadContract({
    address: addresses.priceFeed,
    abi: priceFeedAbi,
    functionName: "fetchPrice",
    query: { refetchInterval: 15_000 },
  });
  return { price: q.data, stale: q.isError, isLoading: q.isLoading };
}

export function useProtocol() {
  const q = useReadContracts({
    allowFailure: false,
    contracts: [
      { ...loans, functionName: "params" },
      { ...loans, functionName: "totalCollateral" },
      { ...loans, functionName: "totalPrincipal" },
      { ...loans, functionName: "pendingTotalInterest" },
      { ...loans, functionName: "rateWeightedPrincipal" },
      { ...loans, functionName: "borrowerCount" },
      { ...loans, functionName: "paused" },
      { ...loans, functionName: "lenderAssets" },
      { ...vault, functionName: "totalAssets" },
      { ...vault, functionName: "totalSupply" },
      { ...vault, functionName: "idleAssets" },
      { ...vault, functionName: "lendableLiquidity" },
      { ...vault, functionName: "pendingAssets" },
      { ...vault, functionName: "pendingShares" },
      { ...vault, functionName: "utilizationBps" },
      { ...vault, functionName: "requestCount" },
      { ...vault, functionName: "queueHead" },
    ],
    query: { refetchInterval: 10_000 },
  });

  if (!q.data) return { data: undefined, isLoading: q.isLoading, error: q.error };
  const [
    p,
    totalCollateral,
    totalPrincipal,
    pendingTotalInterest,
    rateWeightedPrincipal,
    borrowerCount,
    paused,
    lenderAssets,
    totalAssets,
    totalSupply,
    idleAssets,
    lendableLiquidity,
    pendingAssets,
    pendingShares,
    utilizationBps,
    requestCount,
    queueHead,
  ] = q.data;

  const params: Params = {
    interestRateBps: BigInt(p[0]),
    issuanceFeeBps: BigInt(p[1]),
    term: BigInt(p[2]),
    minDebt: p[3],
    maxDebt: p[4],
    mcr: p[5],
    maxCr: p[6],
    expiryBonusBps: BigInt(p[7]),
    underwaterBonusBps: BigInt(p[8]),
    protocolFeeBps: BigInt(p[9]),
  };

  // Lenders' yearly interest on outstanding loans over everything they own, in bps.
  const currentApyBps =
    totalAssets === 0n
      ? 0n
      : (rateWeightedPrincipal * (10_000n - params.protocolFeeBps)) / 10_000n / totalAssets;

  return {
    data: {
      params,
      totalCollateral,
      totalDebt: totalPrincipal + pendingTotalInterest,
      totalPrincipal,
      borrowerCount,
      paused,
      lenderAssets,
      totalAssets,
      totalSupply,
      idleAssets,
      lendableLiquidity,
      pendingAssets,
      pendingShares,
      utilizationBps,
      requestCount,
      queueHead,
      currentApyBps,
    },
    isLoading: false,
    error: null,
  };
}

/** mtMUSD to MUSD at the vault's current rate, matching OpenZeppelin's ERC4626 rounding. */
export const sharesToAssets = (shares: bigint, totalAssets: bigint, totalSupply: bigint) =>
  (shares * (totalAssets + 1n)) / (totalSupply + 1n);

export const assetsToShares = (assets: bigint, totalAssets: bigint, totalSupply: bigint) =>
  (assets * (totalSupply + 1n)) / (totalAssets + 1n);
