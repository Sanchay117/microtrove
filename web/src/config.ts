import deployment from "../../deployments/mezo-testnet.json";
import type { Address } from "viem";

export const CHAIN_ID = deployment.chainId;
export const EXPLORER = deployment.explorer;
export const FAUCET = "https://faucet.test.mezo.org/";

export const addresses = {
  loans: deployment.contracts.Microtroves as Address,
  vault: deployment.contracts.MicrotroveVault as Address,
  musd: deployment.mezo.MUSD as Address,
  priceFeed: deployment.mezo.PriceFeed as Address,
  borrowerOperations: deployment.mezo.BorrowerOperations as Address,
  borrowerOperationsSignatures: deployment.mezo.BorrowerOperationsSignatures as Address,
  hintHelpers: deployment.mezo.HintHelpers as Address,
  sortedTroves: deployment.mezo.SortedTroves as Address,
  troveManager: deployment.mezo.TroveManager as Address,
};

// MUSD trove constants (mezo-org/musd LiquityBase).
export const MUSD_GAS_COMPENSATION = 200n * 10n ** 18n;
export const MUSD_MCR = 11n * 10n ** 17n;

export const txUrl = (hash: string) => `${EXPLORER}/tx/${hash}`;
export const addressUrl = (address: string) => `${EXPLORER}/address/${address}`;
