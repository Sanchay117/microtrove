import { createConnector } from "wagmi";
import {
  createPublicClient,
  createWalletClient,
  http,
  numberToHex,
  type Chain,
  type EIP1193RequestFn,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

/// Development-only wallet backed by a local testnet key, so flows can be exercised
/// without a browser extension. Never enabled in production builds.
export function burner(privateKey: Hex) {
  const account = privateKeyToAccount(privateKey);

  return createConnector((config) => {
    const chain = config.chains[0] as Chain;
    const transport = http(chain.rpcUrls.default.http[0]);
    const wallet = createWalletClient({ account, chain, transport });
    const reader = createPublicClient({ chain, transport });

    const request = (async ({ method, params }: { method: string; params?: unknown }) => {
      const args = (params ?? []) as unknown[];
      switch (method) {
        case "eth_accounts":
        case "eth_requestAccounts":
          return [account.address];
        case "eth_chainId":
          return numberToHex(chain.id);
        case "eth_signTypedData_v4":
          return wallet.signTypedData(JSON.parse(args[1] as string));
        default:
          return reader.request({ method, params } as never);
      }
    }) as EIP1193RequestFn;

    return {
      id: "burner",
      name: "Dev burner",
      type: "burner",
      async connect() {
        return { accounts: [account.address], chainId: chain.id } as never;
      },
      async disconnect() {},
      async getAccounts() {
        return [account.address];
      },
      async getChainId() {
        return chain.id;
      },
      async getProvider() {
        return { request };
      },
      async getClient() {
        return wallet as never;
      },
      // Lets wagmi restore the session after a reload when this was the last wallet used.
      async isAuthorized() {
        return true;
      },
      onAccountsChanged() {},
      onChainChanged() {},
      onDisconnect() {},
    };
  });
}
