/// <reference types="vite/client" />

interface ImportMetaEnv {
  // Development only: a funded testnet key for the "Dev burner" wallet.
  readonly VITE_BURNER_KEY?: `0x${string}`;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
