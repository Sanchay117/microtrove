import { erc20Abi } from "viem";
import { useAccount, useBalance, useReadContracts } from "wagmi";
import { addresses } from "../config";
import { troveManagerAbi } from "../abi/mezo";
import { loans, vault } from "./useProtocol";

export type Trove = {
  active: boolean;
  collateral: bigint;
  principal: bigint;
  interest: bigint;
  debt: bigint;
  maturity: bigint;
  interestRateBps: bigint;
  issuanceFeeBps: bigint;
};

const ZERO = "0x0000000000000000000000000000000000000000" as const;

export function useAccountState() {
  const { address } = useAccount();
  const who = address ?? ZERO;
  const btc = useBalance({ address, query: { enabled: !!address, refetchInterval: 10_000 } });
  const q = useReadContracts({
    allowFailure: false,
    contracts: [
      { ...loans, functionName: "getTrove", args: [who] },
      { ...loans, functionName: "surplus", args: [who] },
      { address: addresses.musd, abi: erc20Abi, functionName: "balanceOf", args: [who] },
      { ...vault, functionName: "balanceOf", args: [who] },
      { ...vault, functionName: "maxWithdraw", args: [who] },
      { address: addresses.troveManager, abi: troveManagerAbi, functionName: "getTroveStatus", args: [who] },
    ],
    query: { enabled: !!address, refetchInterval: 10_000 },
  });

  if (!address || !q.data) return { address, data: undefined, isLoading: q.isLoading };
  const [t, surplus, musd, shares, maxWithdraw, musdTroveStatus] = q.data;
  const trove: Trove = {
    active: t[0],
    collateral: t[1],
    principal: t[2],
    interest: t[3],
    debt: t[4],
    maturity: BigInt(t[5]),
    interestRateBps: BigInt(t[6]),
    issuanceFeeBps: BigInt(t[7]),
  };
  return {
    address,
    data: {
      btc: btc.data?.value ?? 0n,
      musd,
      shares,
      maxWithdraw,
      surplus,
      trove,
      // TroveManager.Status: 1 = active.
      hasMusdTrove: musdTroveStatus === 1,
    },
    isLoading: false,
  };
}
