import { useQuery } from "@tanstack/react-query";
import { createPublicClient, getAddress, http, parseAbi, type Address, type Hex } from "viem";
import { mezoTestnet } from "viem/chains";
import deployment from "../../../deployments/mezo-testnet.json";
import { addresses } from "../config";

export const KEEPER = getAddress(deployment.keeper.address);
export const REPO = "Sanchay117/microtrove";
const WORKFLOW = "keeper.yml";

const events = parseAbi([
  "event Liquidated(address indexed borrower, address indexed liquidator, uint8 mode, uint256 repaid, uint256 collateralToLiquidator, uint256 surplus, uint256 badDebt)",
  "event RedeemRequestFilled(uint256 indexed id, address indexed receiver, uint256 shares, uint256 assets, bool complete)",
]);

const WAVE1 = deployment.wave1.contracts;
const BOOKS = [getAddress(WAVE1.Microtroves), addresses.loans];
const VAULTS = [getAddress(WAVE1.MicrotroveVault), addresses.vault];
// Mezo's RPC answers eth_getLogs for at most 10,000 blocks at a time, and each range takes a second or two.
// The app's transport batches calls into one request, which would time out here, so scans get their own client.
const CHUNK = 10_000n;
const PARALLEL = 6;
const client = createPublicClient({
  chain: mezoTestnet,
  transport: http(undefined, { timeout: 30_000 }),
});

/** Runs `fn` over `items` with at most `limit` calls in flight, keeping order. */
export async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

export type Activity = {
  hash: Hex;
  block: bigint;
  time: number;
  by: Address;
  byKeeper: boolean;
  wave1: boolean;
} & (
  | {
      kind: "liquidation";
      borrower: Address;
      mode: number;
      repaid: bigint;
      received: bigint;
      surplus: bigint;
      badDebt: bigint;
    }
  | { kind: "queue"; requests: number; assets: bigint }
);

/** Liquidations and queue payments in [from, to], one row per transaction. */
async function scan(from: bigint, to: bigint, address: Address[]): Promise<Activity[]> {
  const ranges: [bigint, bigint][] = [];
  for (let start = from; start <= to; start += CHUNK)
    ranges.push([start, start + CHUNK - 1n < to ? start + CHUNK - 1n : to]);
  const chunks = await mapLimit(ranges, PARALLEL, ([fromBlock, toBlock]) =>
    client.getLogs({ address, events, fromBlock, toBlock, strict: true }),
  );
  const logs = chunks.flat();

  const txs = [...new Set(logs.map((l) => l.transactionHash))];
  const [blocks, senders] = await Promise.all([
    mapLimit([...new Set(logs.map((l) => l.blockNumber))], PARALLEL, (n) => client.getBlock({ blockNumber: n })),
    mapLimit(txs, PARALLEL, (hash) => client.getTransaction({ hash })),
  ]);
  const timeOf = new Map(blocks.map((b) => [b.number, Number(b.timestamp)]));
  const fromOf = new Map(senders.map((t) => [t.hash, getAddress(t.from)]));

  // One processQueue call fills several requests; group its fills into one row.
  const rows = new Map<Hex, Activity>();
  for (const l of logs) {
    const by = fromOf.get(l.transactionHash)!;
    const base = {
      hash: l.transactionHash,
      block: l.blockNumber,
      time: timeOf.get(l.blockNumber) ?? 0,
      by,
      byKeeper: by === KEEPER,
      wave1: getAddress(l.address) === BOOKS[0] || getAddress(l.address) === VAULTS[0],
    };
    if (l.eventName === "Liquidated") {
      const a = l.args;
      rows.set(l.transactionHash, {
        ...base,
        kind: "liquidation",
        borrower: a.borrower,
        mode: a.mode,
        repaid: a.repaid,
        received: a.collateralToLiquidator,
        surplus: a.surplus,
        badDebt: a.badDebt,
      });
    } else {
      const prev = rows.get(l.transactionHash);
      const requests = prev?.kind === "queue" ? prev.requests + 1 : 1;
      const assets = (prev?.kind === "queue" ? prev.assets : 0n) + l.args.assets;
      rows.set(l.transactionHash, { ...base, kind: "queue", requests, assets });
    }
  }
  return [...rows.values()];
}

/**
 * Every liquidation and queue payment since launch, newest first, read from chain.
 * The retired Wave 1 contracts never change, so their range is read once; the live range refreshes.
 */
export function useKeeperActivity() {
  const live = useQuery({
    queryKey: ["keeper-activity", addresses.loans],
    staleTime: 60_000,
    refetchInterval: 120_000,
    placeholderData: (previous) => previous,
    queryFn: async () => scan(BigInt(deployment.deployBlock), await client.getBlockNumber(), [BOOKS[1], VAULTS[1]]),
  });
  const wave1 = useQuery({
    queryKey: ["keeper-activity-wave1", BOOKS[0]],
    staleTime: Infinity,
    gcTime: Infinity,
    queryFn: () =>
      scan(BigInt(deployment.wave1.deployBlock), BigInt(deployment.wave1.lastActiveBlock), [BOOKS[0], VAULTS[0]]),
  });
  const data = live.data && [...live.data, ...(wave1.data ?? [])].sort((a, b) => (a.block > b.block ? -1 : 1));
  return {
    data,
    isLoading: live.isLoading,
    isError: live.isError,
    olderLoading: wave1.isLoading,
    olderError: wave1.isError,
  };
}

export type BotRun = {
  status: string;
  conclusion: string | null;
  createdAt: number;
  url: string;
};

/** Recent runs of the hosted keeper on GitHub Actions; null until the workflow exists. */
export function useKeeperRuns() {
  return useQuery({
    queryKey: ["keeper-runs"],
    // GitHub allows 60 unauthenticated calls an hour per IP; the bot only runs every 5 minutes anyway.
    staleTime: 300_000,
    refetchInterval: 300_000,
    retry: false,
    queryFn: async (): Promise<BotRun[] | null> => {
      const res = await fetch(`https://api.github.com/repos/${REPO}/actions/workflows/${WORKFLOW}/runs?per_page=12`, {
        headers: { accept: "application/vnd.github+json" },
      });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`GitHub answered ${res.status}`);
      const body = (await res.json()) as {
        workflow_runs: {
          status: string;
          conclusion: string | null;
          created_at: string;
          html_url: string;
        }[];
      };
      return body.workflow_runs.map((r) => ({
        status: r.status,
        conclusion: r.conclusion,
        createdAt: Date.parse(r.created_at) / 1000,
        url: r.html_url,
      }));
    },
  });
}
