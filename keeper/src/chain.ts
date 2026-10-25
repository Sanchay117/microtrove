import {
  createPublicClient,
  createWalletClient,
  http,
  keccak256,
  type Address,
  type Hash,
  type Hex,
  type TransactionReceipt,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { mezoTestnet } from "viem/chains";
import { config } from "./config.ts";
import { describe, log } from "./format.ts";

if (config.chainId !== mezoTestnet.id) throw new Error(`Unsupported chain ${config.chainId}`);

export const publicClient = createPublicClient({
  chain: mezoTestnet,
  transport: http(config.rpcUrl, { retryCount: 3 }),
});

export const account = config.privateKey ? privateKeyToAccount(config.privateKey) : undefined;

const wallet = account
  ? createWalletClient({ account, chain: mezoTestnet, transport: http(config.rpcUrl, { retryCount: 3 }) })
  : undefined;

export const txUrl = (hash: Hash) => `${config.explorer}/tx/${hash}`;

/**
 * Signs locally so the hash is known before sending. Mezo's testnet RPC sometimes
 * answers eth_sendRawTransaction with an empty response even though the transaction
 * lands, so a failed send only counts once no receipt shows up.
 */
export async function send(to: Address, data: Hex): Promise<TransactionReceipt> {
  if (!wallet) throw new Error("No KEEPER_PRIVATE_KEY to sign with");
  const prepared = await wallet.prepareTransactionRequest({ to, data });
  const serializedTransaction = await wallet.signTransaction(prepared);
  const hash = keccak256(serializedTransaction);
  try {
    await publicClient.sendRawTransaction({ serializedTransaction });
  } catch (err) {
    log.warn(`sending ${hash} failed (${describe(err)}); waiting for a receipt anyway`);
  }
  const receipt = await publicClient.waitForTransactionReceipt({ hash, pollingInterval: 2_000, timeout: 120_000 });
  if (receipt.status !== "success") throw new Error(`Transaction reverted: ${txUrl(hash)}`);
  return receipt;
}
