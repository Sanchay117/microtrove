/// <reference types="vite/client" />

interface ImportMetaEnv {
  // Development only: a funded testnet key for the "Dev burner" wallet.
  readonly VITE_BURNER_KEY?: `0x${string}`;
  // Optional: a WalletConnect (Reown) project id. Turns on QR connections for phone wallets.
  readonly VITE_WALLETCONNECT_PROJECT_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
