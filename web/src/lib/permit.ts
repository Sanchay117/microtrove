import { erc20Abi, parseAbi, parseSignature, type Address, type Hex } from "viem";
import { useAccount, usePublicClient, useSignTypedData, useWriteContract } from "wagmi";
import { addresses, CHAIN_ID } from "../config";

const noncesAbi = parseAbi(["function nonces(address owner) view returns (uint256)"]);

// MUSD is an OpenZeppelin ERC20Permit; its eip712Domain() on Mezo Testnet reports these.
const MUSD_DOMAIN = { name: "Mezo USD", version: "1" } as const;

const permitTypes = {
  Permit: [
    { name: "owner", type: "address" },
    { name: "spender", type: "address" },
    { name: "value", type: "uint256" },
    { name: "nonce", type: "uint256" },
    { name: "deadline", type: "uint256" },
  ],
} as const;

export type Permit = { deadline: bigint; v: number; r: Hex; s: Hex };

/** What the caller should do to let `spender` pull MUSD. */
export type Authorization =
  | { kind: "allowance" }
  | { kind: "permit"; permit: Permit }
  | { kind: "approve" };

const isRejection = (error: unknown) => {
  const e = error as { code?: number; name?: string; cause?: { code?: number } };
  return e?.code === 4001 || e?.cause?.code === 4001 || e?.name === "UserRejectedRequestError";
};

/**
 * Returns a function that authorizes `spender` to take `value` MUSD with an EIP-2612
 * signature instead of an approval transaction. It skips the signature when an
 * existing allowance is enough, and falls back to an approval for smart-account
 * wallets and wallets that cannot sign typed data.
 */
export function useMusdPermit() {
  const { address } = useAccount();
  const client = usePublicClient();
  const { signTypedDataAsync } = useSignTypedData();

  return async (spender: Address, value: bigint): Promise<Authorization> => {
    if (!address || !client) throw new Error("Connect a wallet first.");
    const [allowance, nonce, code] = await Promise.all([
      client.readContract({ address: addresses.musd, abi: erc20Abi, functionName: "allowance", args: [address, spender] }),
      client.readContract({ address: addresses.musd, abi: noncesAbi, functionName: "nonces", args: [address] }),
      client.getCode({ address }),
    ]);
    if (allowance >= value) return { kind: "allowance" };
    // MUSD checks permits with ECDSA only, which smart accounts cannot produce.
    if (code && code !== "0x") return { kind: "approve" };

    const deadline = BigInt(Math.floor(Date.now() / 1000) + 20 * 60);
    let signature: Hex;
    try {
      signature = await signTypedDataAsync({
        domain: { ...MUSD_DOMAIN, chainId: CHAIN_ID, verifyingContract: addresses.musd },
        types: permitTypes,
        primaryType: "Permit",
        message: { owner: address, spender, value, nonce, deadline },
      });
    } catch (error) {
      if (isRejection(error)) throw error;
      return { kind: "approve" };
    }
    const { r, s, v, yParity } = parseSignature(signature);
    return { kind: "permit", permit: { deadline, r, s, v: Number(v ?? BigInt(27 + (yParity ?? 0))) } };
  };
}

/**
 * One click for anything that pays the loan book in MUSD: signs a permit and sends
 * `withPermit`, or, when no permit is possible, approves first and sends `plain`.
 * Resolves to the hash of the final transaction, so it fits `useTx().run`.
 */
export function usePayLoanBook() {
  const authorize = useMusdPermit();
  const client = usePublicClient();
  const { writeContractAsync } = useWriteContract();

  return async (value: bigint, plain: () => Promise<Hex>, withPermit: (p: Permit) => Promise<Hex>) => {
    const auth = await authorize(addresses.loans, value);
    if (auth.kind === "permit") return withPermit(auth.permit);
    if (auth.kind === "approve") {
      const hash = await writeContractAsync({
        address: addresses.musd,
        abi: erc20Abi,
        functionName: "approve",
        args: [addresses.loans, value],
      });
      const receipt = await client!.waitForTransactionReceipt({ hash, pollingInterval: 2_000 });
      if (receipt.status !== "success") throw new Error("The MUSD approval failed.");
    }
    return plain();
  };
}
