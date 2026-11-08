import { createConnector, type CreateConnectorFn } from "wagmi";
import { encodeFunctionData, type Abi, type Address, type Client, type Hex } from "viem";
import { mezoTestnet } from "viem/chains";

/**
 * Bitcoin wallets through Mezo Passport. Mezo's OrangeKit gives each Bitcoin wallet a
 * smart account (a Safe) on Mezo, controlled by Bitcoin message signatures, and Mezo's
 * relayer submits its transactions. To the rest of the app it is an ordinary wagmi
 * connector whose address is that smart account.
 *
 * OrangeKit and its dependencies are large, so they load only when someone connects a
 * Bitcoin wallet, or reconnects one they used before.
 */

export const BITCOIN_CONNECTOR_TYPE = "orangekit";

export type BitcoinWalletId = "orangekit-unisat" | "orangekit-okx" | "orangekit-xverse";

type Injected = {
  unisat?: unknown;
  okxwallet?: { bitcoin?: unknown };
  XverseProviders?: { BitcoinProvider?: unknown };
};
const injected = () => (typeof window === "undefined" ? {} : (window as unknown as Injected));

export const BITCOIN_WALLETS: { id: BitcoinWalletId; name: string; download: string; detect: () => boolean }[] = [
  { id: "orangekit-unisat", name: "Unisat", download: "https://unisat.io/download", detect: () => !!injected().unisat },
  { id: "orangekit-okx", name: "OKX Wallet", download: "https://www.okx.com/web3", detect: () => !!injected().okxwallet?.bitcoin },
  {
    id: "orangekit-xverse",
    name: "Xverse",
    download: "https://www.xverse.app/download",
    detect: () => !!injected().XverseProviders?.BitcoinProvider,
  },
];

// OrangeKit 1.0.0-beta.40 sends Mezo Testnet relay calls to test.mezo.org, which no longer
// serves the relayer (Cloudflare error 1000, "DNS points to prohibited IP"). Mezo's testnet
// app and relayer now live at testnet.mezo.org, which accepts calls from any site, so
// those two endpoints are rewritten there.
const STALE_RELAY = /^https:\/\/test\.mezo\.org\/api\/v2\/relay\/(transactions|deploy-safe)$/;
const RELAY = "https://testnet.mezo.org/api/v2/relay/";

function pointRelayAtTestnet() {
  const native = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const match = STALE_RELAY.exec(url);
    if (!match) return native(input, init);
    const response = await native(RELAY + match[1], init);
    if (!response.ok) {
      const text = await response.text();
      let reason = text.slice(0, 200);
      try {
        const body = JSON.parse(text) as { error?: string; message?: string };
        reason = body.error ?? body.message ?? reason;
      } catch {
        // Not JSON; keep the raw text.
      }
      throw new Error(`Mezo's relayer did not accept the transaction (${response.status}): ${reason}`);
    }
    return response;
  };
}

let orangeKit: Promise<typeof import("@mezo-org/orangekit")> | undefined;

function loadOrangeKit() {
  orangeKit ??= (async () => {
    // OrangeKit, bitcoinjs and Safe's SDK expect Node's `global`, `Buffer` and `process`.
    const { Buffer } = await import("buffer");
    const scope = globalThis as { Buffer?: unknown; global?: unknown; process?: unknown };
    scope.global ??= globalThis;
    scope.Buffer ??= Buffer;
    scope.process ??= {
      env: {},
      browser: true,
      version: "",
      versions: {},
      nextTick: (fn: (...args: unknown[]) => void, ...args: unknown[]) => queueMicrotask(() => fn(...args)),
    };
    pointRelayAtTestnet();
    return import("@mezo-org/orangekit");
  })();
  return orangeKit;
}

type Inner = ReturnType<CreateConnectorFn> & {
  getBitcoinAddress(): Promise<string>;
};

async function orangeKitConnector(id: BitcoinWalletId): Promise<CreateConnectorFn> {
  const kit = await loadOrangeKit();
  const make = id === "orangekit-unisat" ? kit.getUnisatWallet : id === "orangekit-okx" ? kit.getOKXWallet : kit.getXverseWallet;
  const wallet = make({ rpcUrl: mezoTestnet.rpcUrls.default.http[0], chainId: mezoTestnet.id })();
  // RainbowKit passes wallet details here; OrangeKit's connectors ignore them.
  return (wallet.createConnector as unknown as () => CreateConnectorFn)();
}

type SmartAccountClient = Record<string, unknown> & {
  sendTransaction: (tx: { to?: Address; value?: bigint; data?: Hex }) => Promise<Hex>;
};

/**
 * OrangeKit's client overrides `sendTransaction` to go through the smart account, but
 * viem's `writeContract` on that client still calls the original, which tries to sign a
 * raw transaction locally. Route both through the smart account, and fail clearly if
 * the relayer gives no transaction hash back.
 */
function throughSmartAccount(client: SmartAccountClient) {
  const relayed = client.sendTransaction;
  const sendTransaction = async (tx: { to?: Address; value?: bigint; data?: Hex }) => {
    const hash = await relayed({ to: tx.to, value: tx.value ?? 0n, data: tx.data ?? "0x" });
    if (!/^0x[0-9a-fA-F]{64}$/.test(hash ?? "")) throw new Error("Mezo's relayer did not return a transaction hash.");
    return hash;
  };
  const writeContract = (p: { address: Address; abi: Abi; functionName: string; args?: readonly unknown[]; value?: bigint }) =>
    sendTransaction({
      to: p.address,
      value: p.value,
      data: encodeFunctionData({ abi: p.abi, functionName: p.functionName, args: p.args } as never),
    });
  return { ...client, sendTransaction, writeContract } as unknown as Client;
}

/** A wagmi connector for one Bitcoin wallet that loads OrangeKit on first real use. */
function bitcoinConnector(wallet: (typeof BITCOIN_WALLETS)[number]) {
  return createConnector<unknown, { getBitcoinAddress(): Promise<string> }>((config) => {
    let inner: Inner | undefined;
    const get = async () => {
      if (!inner) {
        const create = await orangeKitConnector(wallet.id);
        const connector = create(config) as Inner;
        await connector.setup?.();
        inner = connector;
      }
      return inner;
    };
    // On page load wagmi asks every connector for its provider. Only load OrangeKit for
    // the wallet the user connected last time.
    const wanted = async () => {
      if (inner) return true;
      if (!wallet.detect()) return false;
      const recent = await config.storage?.getItem("recentConnectorId");
      return recent === wallet.id;
    };

    return {
      id: wallet.id,
      name: wallet.name,
      type: BITCOIN_CONNECTOR_TYPE,
      async connect(parameters) {
        return (await get()).connect(parameters as never) as never;
      },
      async disconnect() {
        if (inner) await inner.disconnect();
      },
      async getAccounts() {
        return (await get()).getAccounts();
      },
      async getChainId() {
        return inner ? inner.getChainId() : mezoTestnet.id;
      },
      async getProvider(parameters) {
        return (await wanted()) ? (await get()).getProvider(parameters) : undefined;
      },
      async getClient(parameters) {
        return throughSmartAccount((await (await get()).getClient!(parameters)) as unknown as SmartAccountClient);
      },
      async isAuthorized() {
        return (await wanted()) ? (await get()).isAuthorized() : false;
      },
      async switchChain(parameters) {
        return (await get()).switchChain!(parameters);
      },
      async getBitcoinAddress() {
        return (await get()).getBitcoinAddress();
      },
      onAccountsChanged() {},
      onChainChanged() {},
      onDisconnect() {
        config.emitter.emit("disconnect");
      },
    };
  });
}

export const bitcoinConnectors = () => BITCOIN_WALLETS.map(bitcoinConnector);

/** The connected Bitcoin address behind a Mezo Passport smart account. */
export async function bitcoinAddressOf(connector: unknown): Promise<string | undefined> {
  const c = connector as { type?: string; getBitcoinAddress?: () => Promise<string> };
  if (c?.type !== BITCOIN_CONNECTOR_TYPE || !c.getBitcoinAddress) return undefined;
  return c.getBitcoinAddress().catch(() => undefined);
}
