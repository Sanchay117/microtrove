# Microtrove contracts

Fixed-term MUSD microloans of 25 to 200 MUSD backed by BTC on Mezo. This implements
Mezo's own design, [RFC-2: Lending Arbitrage Microloans](https://github.com/mezo-org/musd/blob/rfc-2/docs/rfc/rfc-2.md),
plus the open lender funding that RFC-2 lists as future work.

MUSD troves need at least 1,800 MUSD of debt. Microtrove lets someone borrow $25
against about $50 of BTC, learn how a collateralized loan behaves, and later promote
the position into a full MUSD trove in one transaction.

## Live on Mezo testnet (chain 31611)

| Contract | Address |
| --- | --- |
| `MicrotroveVault` | [`0xE128f5F21Adac4a11A22B55Da77bfdb6ab1304e2`](https://explorer.test.mezo.org/address/0xE128f5F21Adac4a11A22B55Da77bfdb6ab1304e2) |
| `Microtroves` | [`0x6Af91a391C31e85479bd324698c30697EbEC8C77`](https://explorer.test.mezo.org/address/0x6Af91a391C31e85479bd324698c30697EbEC8C77) |

Both are verified on Sourcify with an exact match
([vault](https://repo.sourcify.dev/31611/0xE128f5F21Adac4a11A22B55Da77bfdb6ab1304e2),
[loan book](https://repo.sourcify.dev/31611/0x6Af91a391C31e85479bd324698c30697EbEC8C77)),
deployed against the live MUSD contracts,
and seeded with 1,400 MUSD that was borrowed from a real MUSD trove. A full loan
lifecycle has run on chain:

| Step | Transaction |
| --- | --- |
| Open with 0.0025 BTC and borrow 100 MUSD | [`0x6269...7ecd`](https://explorer.test.mezo.org/tx/0x62698fb4161b379a1ddc1c88819fda142242fec31ea3333a4f7d5011a9fa7ecd) |
| Repay 50 MUSD | [`0x8ecf...6c26`](https://explorer.test.mezo.org/tx/0x8ecfcc6e439c557b146dfa19f013eb206860997234b7ddd8ae062351fa976c26) |
| Close: repay the rest with interest, BTC returned | [`0xb823...66b1`](https://explorer.test.mezo.org/tx/0xb82399bfeb6a13e5dde6cdb823c318f5f9a09f5e64c28c5df2b3ac0d33da66b1) |

An expiry liquidation has also run live. The term was set to 1 hour for one 40 MUSD
borrow and then restored to 90 days. The [keeper bot](../keeper) liquidated the loan 36
seconds after it matured, and the borrower claimed the rest of their BTC from the web app:

| Step | Transaction |
| --- | --- |
| Term set to 1 hour (contract minimum) | [`0xc782...8a5d`](https://explorer.test.mezo.org/tx/0xc78229b93c72d21d8b30f772fa7eebdf7e59a47f8da58283cef98b3ac8fc8a5d) |
| Borrower starts a 40 MUSD term | [`0xacd3...5609`](https://explorer.test.mezo.org/tx/0xacd3596ace2616460c1ed0350030f5be3525eae54d264979c923b305aea85609) |
| Term restored to 90 days | [`0xeac8...d033`](https://explorer.test.mezo.org/tx/0xeac8e308003d197df223c101e0c5bf597a9b9d26e21e890fa5a091634b81d033) |
| Keeper repays 40.20 MUSD, receives BTC worth the debt plus 10% | [`0xfe7a...cd51`](https://explorer.test.mezo.org/tx/0xfe7a0c608465370d633178d33ef1d7696ad057026eb36172b0f28c32a48dcd51) |
| Borrower claims the remaining 0.00045335 BTC | [`0xc3a1...568a`](https://explorer.test.mezo.org/tx/0xc3a17a4a897a2284c6d53a65e6dcb524019358363927c54a8b6d67db5d4e568a) |

Addresses, parameters and every transaction are in
[`deployments/mezo-testnet.json`](../deployments/mezo-testnet.json).

## Contracts

| Contract | Role |
| --- | --- |
| `Microtroves` | Loan book. Holds BTC collateral, tracks each micro trove, accrues fixed simple interest, runs liquidations and promotions. |
| `MicrotroveVault` | ERC-4626 vault (`mtMUSD`) that anyone can fund with MUSD. Lends to `Microtroves` and earns its interest and issuance fees. |

### Mezo integrations

- **MUSD** is the loan currency and the vault asset (EIP-2612 permits for one-step repay and close).
- **MUSD `PriceFeed`** prices BTC for every collateral check and liquidation.
- **MUSD `BorrowerOperationsSignatures.openTroveWithSignature`** powers promotion: the borrower signs MUSD's EIP-712 `OpenTrove` message with `Microtroves` as recipient, the new trove's MUSD repays the micro loan, and the rest goes to the borrower.

## Loan rules (RFC-2 defaults, governable)

| Parameter | Default |
| --- | --- |
| Debt per trove (including issuance fee) | 25 to 200 MUSD |
| Interest | 5% APR, simple, fixed for the term |
| Issuance fee | 0.5%, added to debt |
| Term | 90 days from the first borrow |
| Collateral ratio | 110% minimum, 500% maximum |
| Matured-loan liquidator premium | 10% of the debt, paid in BTC |
| Underwater liquidator premium | 5% |
| Protocol share of interest | 0% (fee switch, capped at 20%) |

Rate, fee and term are captured when a debt term starts, so governance changes only
affect new terms. Borrowing more never extends the maturity.

### Liquidations

- **Below 110%:** the liquidator repays the debt and takes all collateral. If the trove
  is underwater, the repayment is reduced so the liquidator still earns 5%, and lenders
  absorb the shortfall through the vault's share price.
- **At maturity:** the liquidator repays the debt and receives BTC worth the debt plus
  10%. The borrower claims the remaining BTC with `claimSurplus`.

**Deviation from RFC-2.** RFC-2 pays the liquidator of a matured loan 10% of the
collateral. With collateral capped at 500% of debt, that reward is worth at most half of
the debt the liquidator must repay, so no keeper would ever run it.
`testFuzz_ExpiredLiquidationIsAlwaysProfitable` checks both rules across every allowed
collateral ratio.

### Lender vault

- Deposits and instant withdrawals work against idle MUSD.
- `requestRedeem` queues shares first-in, first-out. Queued shares keep earning until
  `processQueue` pays them, and their value is reserved so no new loans are made from it.
  Every loan matures within one term, so a request waits at most that long.
- The vault owner can only connect the loan book once. Nobody can move lender funds.

### Safety properties

- Repaying and closing never read the oracle, so a borrower can always exit.
- Pausing stops new debt only; repay, close, withdraw and liquidate keep working.
- Every external entry point is `nonReentrant`; BTC is sent last.

## Tests

```bash
git submodule update --init --recursive   # once, from the repository root
forge test
```

53 tests: unit tests for every borrower, lender, keeper and governance path, fuzz
tests, promotion tests that sign real EIP-712 messages against a mock that reproduces
`BorrowerOperationsSignatures`, and a stateful invariant suite (64 runs x 400 calls)
checking that BTC, principal, interest and vault assets always reconcile.

```bash
forge coverage --no-match-coverage "test|script"
```

## Deploy to Mezo testnet

```bash
cp .env.example .env   # or use the generated .env with PRIVATE_KEY
source .env
forge script script/Deploy.s.sol --rpc-url mezo_testnet --broadcast
```

Set `TERM_SECONDS` for a short-term demo deployment and `SEED_MUSD` to fund the vault
from the deployer.

The testnet RPC sometimes returns a null receipt right after a send even though the
transaction lands. Check with `cast receipt <hash>` before resending. The explorer's own
Blockscout verifier answers "Unable to verify" even for byte-identical builds, so verify on
Sourcify instead:

```bash
forge verify-contract <address> src/Microtroves.sol:Microtroves --chain-id 31611 \
  --verifier sourcify --constructor-args <abi-encoded args>
```
