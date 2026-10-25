import { parseAbi } from "viem";

// The parts of the MUSD system this app reads (mezo-org/musd).
export const priceFeedAbi = parseAbi(["function fetchPrice() view returns (uint256)"]);

export const borrowerOperationsAbi = parseAbi([
  "function getBorrowingFee(uint256 debt) view returns (uint256)",
  "function minNetDebt() view returns (uint256)",
]);

export const borrowerOperationsSignaturesAbi = parseAbi([
  "function getNonce(address user) view returns (uint256)",
]);

export const hintHelpersAbi = parseAbi([
  "function computeNominalCR(uint256 coll, uint256 debt) pure returns (uint256)",
  "function getApproxHint(uint256 cr, uint256 numTrials, uint256 seed) view returns (address hintAddress, uint256 diff, uint256 latestRandomSeed)",
]);

export const sortedTrovesAbi = parseAbi([
  "function findInsertPosition(uint256 nicr, address prevId, address nextId) view returns (address, address)",
]);

export const troveManagerAbi = parseAbi([
  "function getTroveStatus(address borrower) view returns (uint8)",
  "function getTroveOwnersCount() view returns (uint256)",
  "function checkRecoveryMode(uint256 price) view returns (bool)",
]);
