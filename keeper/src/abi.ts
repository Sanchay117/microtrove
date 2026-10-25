import { parseAbi } from "viem";

export const loanBookAbi = parseAbi([
  "struct LiquidationPreview { uint8 mode; uint256 debt; uint256 repayAmount; uint256 collateralToLiquidator; uint256 surplus; }",
  "function borrowerCount() view returns (uint256)",
  "function getLiquidatable(uint256 start, uint256 count) view returns (address[])",
  "function previewLiquidation(address borrower) view returns (LiquidationPreview)",
  "function liquidate(address borrower)",
  "event Liquidated(address indexed borrower, address indexed liquidator, uint8 mode, uint256 repaid, uint256 collateralToLiquidator, uint256 surplus, uint256 badDebt)",
  "error NotLiquidatable()",
  "error TroveNotActive()",
  "error BtcTransferFailed()",
]);

export const vaultAbi = parseAbi([
  "function pendingShares() view returns (uint256)",
  "function idleAssets() view returns (uint256)",
  "function processQueue(uint256 maxRequests) returns (uint256 filled)",
  "event RedeemRequestFilled(uint256 indexed id, address indexed receiver, uint256 shares, uint256 assets, bool complete)",
]);

// MUSD's PriceFeed updates its last good price in fetchPrice, but an eth_call is enough to read it.
export const priceFeedAbi = parseAbi(["function fetchPrice() view returns (uint256)"]);
