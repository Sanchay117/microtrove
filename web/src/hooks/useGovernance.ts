import { useQuery } from "@tanstack/react-query";
import { createPublicClient, getAddress, http, parseAbi, type Address, type Hex } from "viem";
import { mezoTestnet } from "viem/chains";
import deployment from "../../../deployments/mezo-testnet.json";
import { mapLimit } from "./useKeeperActivity";

export const TIMELOCK = getAddress(deployment.governance.TimelockController);
const FROM_BLOCK = BigInt(deployment.governance.deployBlock);

const timelockAbi = parseAbi([
  "function getMinDelay() view returns (uint256)",
  "function getTimestamp(bytes32 id) view returns (uint256)",
  "event CallScheduled(bytes32 indexed id, uint256 indexed index, address target, uint256 value, bytes data, bytes32 predecessor, uint256 delay)",
  "event CallExecuted(bytes32 indexed id, uint256 indexed index, address target, uint256 value, bytes data)",
  "event Cancelled(bytes32 indexed id)",
]);

// Same limits as the keeper activity scan: 10,000 blocks per eth_getLogs, a few in flight.
const CHUNK = 10_000n;
const client = createPublicClient({ chain: mezoTestnet, transport: http(undefined, { timeout: 30_000 }) });

export type PendingCall = { target: Address; data: Hex };
export type PendingChange = { id: Hex; readyAt: number; calls: PendingCall[] };

/** The timelock's delay and every operation scheduled on it that has not run or been cancelled. */
export function useGovernance() {
  return useQuery({
    queryKey: ["governance"],
    refetchInterval: 60_000,
    queryFn: async () => {
      const [delay, latest] = await Promise.all([
        client.readContract({ address: TIMELOCK, abi: timelockAbi, functionName: "getMinDelay" }),
        client.getBlockNumber(),
      ]);
      const ranges: [bigint, bigint][] = [];
      for (let start = FROM_BLOCK; start <= latest; start += CHUNK)
        ranges.push([start, start + CHUNK - 1n < latest ? start + CHUNK - 1n : latest]);
      const logs = (
        await mapLimit(ranges, 6, ([fromBlock, toBlock]) =>
          client.getLogs({ address: TIMELOCK, events: timelockAbi.filter((x) => x.type === "event"), fromBlock, toBlock, strict: true }),
        )
      ).flat();

      const done = new Set<Hex>();
      const scheduled = new Map<Hex, PendingCall[]>();
      for (const l of logs) {
        if (l.eventName === "CallScheduled") {
          const calls = scheduled.get(l.args.id) ?? [];
          calls[Number(l.args.index)] = { target: getAddress(l.args.target), data: l.args.data };
          scheduled.set(l.args.id, calls);
        } else {
          done.add(l.args.id);
        }
      }
      const open = [...scheduled].filter(([id]) => !done.has(id));
      const pending: PendingChange[] = await Promise.all(
        open.map(async ([id, calls]) => ({
          id,
          calls,
          readyAt: Number(await client.readContract({ address: TIMELOCK, abi: timelockAbi, functionName: "getTimestamp", args: [id] })),
        })),
      );
      return { delay: Number(delay), pending: pending.sort((a, b) => a.readyAt - b.readyAt) };
    },
  });
}
