import { createConfig, http } from "wagmi";
import { injected } from "wagmi/connectors";
import { mezoTestnet } from "viem/chains";
import { burner } from "./burner";

// `.env.development.local` is only read by `vite dev`, so the key never reaches a build.
const burnerKey = import.meta.env.DEV ? import.meta.env.VITE_BURNER_KEY : undefined;

export const config = createConfig({
  chains: [mezoTestnet],
  connectors: [injected(), ...(burnerKey ? [burner(burnerKey)] : [])],
  transports: { [mezoTestnet.id]: http(undefined, { batch: true }) },
  pollingInterval: 4_000,
});

declare module "wagmi" {
  interface Register {
    config: typeof config;
  }
}
