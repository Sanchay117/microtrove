import { useQuery } from "@tanstack/react-query";
import { usePublicClient } from "wagmi";
import type { Address } from "viem";
import deployment from "../../../deployments/mezo-testnet.json";
import { addresses } from "../config";
import { microtrovesAbi } from "../abi/Microtroves";
import { vaultAbi } from "../abi/MicrotroveVault";
import { ONE } from "../lib/math";

type Segment = { label: string; vault: Address; book: Address; from: bigint; to?: bigint; protocolFeeBps: bigint };

// The Wave 1 vault was retired on Nov 7, 2026 and its lenders moved to the current one.
// Showing both keeps the full history since launch.
export const SEGMENTS: Segment[] = [
  {
    label: "Wave 1 vault",
    vault: deployment.wave1.contracts.MicrotroveVault as Address,
    book: deployment.wave1.contracts.Microtroves as Address,
    from: BigInt(deployment.wave1.deployBlock) + 1n,
    to: BigInt(deployment.wave1.lastActiveBlock),
    protocolFeeBps: 0n,
  },
  {
    label: "Current vault",
    vault: addresses.vault,
    book: addresses.loans,
    from: BigInt(deployment.deployBlock) + 1n,
    protocolFeeBps: BigInt(deployment.params.protocolFeeBps),
  },
];

export type HistoryPoint = {
  block: bigint;
  /** Unix seconds. */
  time: number;
  segment: number;
  /** Interest-only supply rate: what open loans pay lenders per year over vault assets. */
  apyBps: number;
  utilizationBps: number;
  /** MUSD per mtMUSD. */
  sharePrice: number;
  totalAssets: number;
};

const segmentOf = (block: bigint) =>
  SEGMENTS.findIndex((s) => block >= s.from && (s.to === undefined || block <= s.to));

/** Samples the vault's rate, utilization and share price across its whole life with archive reads. */
export function useVaultHistory(samples = 60) {
  const client = usePublicClient();
  return useQuery({
    queryKey: ["vault-history", addresses.vault, samples],
    enabled: !!client,
    staleTime: 5 * 60_000,
    refetchInterval: 5 * 60_000,
    placeholderData: (previous) => previous,
    queryFn: async (): Promise<HistoryPoint[]> => {
      const start = SEGMENTS[0].from;
      const [first, latest] = await Promise.all([client!.getBlock({ blockNumber: start }), client!.getBlock()]);
      const span = latest.number - start;

      const wanted = new Set<bigint>([SEGMENTS[0].to!, SEGMENTS[1].from, latest.number]);
      for (let i = 0; i < samples; i++) wanted.add(start + (span * BigInt(i)) / BigInt(samples - 1));
      const blocks = [...wanted].filter((b) => segmentOf(b) >= 0).sort((a, b) => (a < b ? -1 : 1));

      // Mezo blocks come at a steady pace, so timestamps are interpolated between two real ones.
      const secondsPerBlock = Number(latest.timestamp - first.timestamp) / Number(span || 1n);
      const timeOf = (b: bigint) => Number(first.timestamp) + Number(b - start) * secondsPerBlock;

      return Promise.all(
        blocks.map(async (block) => {
          const segment = segmentOf(block);
          const s = SEGMENTS[segment];
          // A read fails only in the first blocks of a deployment, before the loan book
          // existed; those count as an empty vault.
          const results = await client!.multicall({
            blockNumber: block,
            allowFailure: true,
            contracts: [
              { address: s.vault, abi: vaultAbi, functionName: "totalAssets" },
              { address: s.vault, abi: vaultAbi, functionName: "utilizationBps" },
              { address: s.book, abi: microtrovesAbi, functionName: "rateWeightedPrincipal" },
              { address: s.vault, abi: vaultAbi, functionName: "convertToAssets", args: [ONE] },
            ],
          });
          const read = (i: number, fallback: bigint) =>
            results[i].status === "success" ? (results[i].result as bigint) : fallback;
          const [totalAssets, utilizationBps, weighted, sharePrice] = [read(0, 0n), read(1, 0n), read(2, 0n), read(3, ONE)];
          const apy = totalAssets === 0n ? 0n : (weighted * (10_000n - s.protocolFeeBps)) / 10_000n / totalAssets;
          return {
            block,
            time: timeOf(block),
            segment,
            apyBps: Number(apy),
            utilizationBps: Number(utilizationBps),
            sharePrice: Number(sharePrice) / 1e18,
            totalAssets: Number(totalAssets) / 1e18,
          };
        }),
      );
    },
  });
}
