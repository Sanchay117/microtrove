// Mirrors the arithmetic in Microtroves.sol so previews match what the contract does.

export const ONE = 10n ** 18n;
export const BPS = 10_000n;
export const YEAR = 365n * 24n * 60n * 60n;

const ceilDiv = (a: bigint, b: bigint) => (a + b - 1n) / b;

export const feeFor = (amount: bigint, feeBps: bigint) => ceilDiv(amount * feeBps, BPS);

export const collateralValue = (collateral: bigint, price: bigint) => (collateral * price) / ONE;

/** Collateral ratio with 1e18 = 100%; undefined when there is no debt. */
export const icr = (collateral: bigint, debt: bigint, price: bigint) =>
  debt === 0n ? undefined : (collateral * price) / debt;

/** BTC price at which the trove reaches the minimum ratio. */
export const liquidationPrice = (collateral: bigint, debt: bigint, mcr: bigint) =>
  collateral === 0n || debt === 0n ? undefined : (mcr * debt) / collateral;

export const interestFor = (principal: bigint, rateBps: bigint, seconds: bigint) =>
  (principal * rateBps * seconds) / (YEAR * BPS);

/** BTC needed for `debt` at collateral ratio `ratio` (1e18 = 100%). */
export const collateralFor = (debt: bigint, ratio: bigint, price: bigint) =>
  price === 0n ? 0n : ceilDiv(debt * ratio, price);

export const minBig = (a: bigint, b: bigint) => (a < b ? a : b);
export const maxBig = (a: bigint, b: bigint) => (a > b ? a : b);
