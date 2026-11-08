import { createConfig, http } from "wagmi";
import { coinbaseWallet, injected, walletConnect } from "wagmi/connectors";
import { mezoTestnet } from "viem/chains";
import { burner } from "./burner";
import { bitcoinConnectors } from "./bitcoin";

// `.env.development.local` is only read by `vite dev`, so the key never reaches a build.
const burnerKey = import.meta.env.DEV ? import.meta.env.VITE_BURNER_KEY : undefined;
// Free from dashboard.reown.com. Without it the WalletConnect option is hidden.
const walletConnectId = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID;

const app = {
  name: "Microtrove",
  description: "BTC-backed MUSD microloans on Mezo",
  url: "https://microtrove.vercel.app",
  icon: "https://microtrove.vercel.app/icon.png",
};

export const config = createConfig({
  chains: [mezoTestnet],
  // Extension wallets announce themselves over EIP-6963 and are added on top of these.
  multiInjectedProviderDiscovery: true,
  connectors: [
    injected(),
    // Coinbase Smart Wallet does not run on Mezo, so connect the extension or the mobile app.
    coinbaseWallet({ version: "4", appName: app.name, appLogoUrl: app.icon, preference: { options: "eoaOnly" } }),
    ...(walletConnectId
      ? [
          walletConnect({
            projectId: walletConnectId,
            metadata: { name: app.name, description: app.description, url: app.url, icons: [app.icon] },
            qrModalOptions: { themeMode: "dark" },
          }),
        ]
      : []),
    // Unisat, OKX and Xverse through Mezo Passport, each acting through its own smart account.
    ...bitcoinConnectors(),
    ...(burnerKey ? [burner(burnerKey)] : []),
  ],
  transports: { [mezoTestnet.id]: http(undefined, { batch: true }) },
  pollingInterval: 4_000,
});

declare module "wagmi" {
  interface Register {
    config: typeof config;
  }
}
