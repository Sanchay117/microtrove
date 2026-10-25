# Microtrove

**Borrow 25 to 200 MUSD against bitcoin on Mezo, funded by anyone who lends MUSD.**

An MUSD trove needs at least 1,800 MUSD of debt, so a newcomer has to lock about $2,000 of BTC to
try it. Microtrove builds Mezo's own unshipped design for small loans,
[RFC-2: Lending Arbitrage Microloans](https://github.com/mezo-org/musd/blob/rfc-2/docs/rfc/rfc-2.md):
- fixed-term micro troves at a fixed rate
- liquidation below 110% or at maturity
- one-transaction promotion into a full MUSD trove

It adds what RFC-2 lists as future work: an open ERC-4626 lender vault with first-in,
first-out withdrawals, so the loans are funded by lenders instead of a treasury.

## Live on Mezo Testnet

| | |
| --- | --- |
| Loan book (`Microtroves`) | [`0x6Af91a391C31e85479bd324698c30697EbEC8C77`](https://explorer.test.mezo.org/address/0x6Af91a391C31e85479bd324698c30697EbEC8C77) |
| Lender vault (`MicrotroveVault`, mtMUSD) | [`0xE128f5F21Adac4a11A22B55Da77bfdb6ab1304e2`](https://explorer.test.mezo.org/address/0xE128f5F21Adac4a11A22B55Da77bfdb6ab1304e2) |

Both are verified on Sourcify and wired to the live MUSD, PriceFeed and
BorrowerOperationsSignatures contracts. The vault is seeded with MUSD borrowed from a real
MUSD trove.

Every step has run on chain:
- A borrower opened, borrowed, repaid and closed a loan.
- Lenders deposited and withdrew, both instantly and through the queue.
- The [keeper bot](keeper) liquidated a matured loan
  [36 seconds after its due date](https://explorer.test.mezo.org/tx/0xfe7a0c608465370d633178d33ef1d7696ad057026eb36172b0f28c32a48dcd51),
  for a $3.98 profit.
- The borrower claimed the rest of their BTC from the web app.

Every transaction is listed in [`deployments/mezo-testnet.json`](deployments/mezo-testnet.json).

## Repository

| Folder | What is in it |
| --- | --- |
| [`contracts/`](contracts) | Foundry project: loan book, vault, 53 tests (unit, fuzz, promotion with real EIP-712 signatures, stateful invariants), deploy script |
| [`web/`](web) | React app with Borrow, Lend and Keepers views |
| [`keeper/`](keeper) | Bot that liquidates matured and undercollateralized loans for profit and pays the vault's withdrawal queue |
| [`deployments/`](deployments) | Addresses, parameters and transaction hashes shared by the app, the keeper and scripts |

## Quick start

```bash
git submodule update --init --recursive   # forge-std and OpenZeppelin 5.1.0
(cd contracts && forge test)
(cd keeper && npm install && npm test && npm run watch)
(cd web && npm install && npm run dev)
```

## How it uses Mezo

- **MUSD** is the loan currency and the vault asset.
- **MUSD PriceFeed** prices BTC for every collateral check and liquidation.
- **BorrowerOperationsSignatures.openTroveWithSignature** powers promotion. The borrower
  signs MUSD's EIP-712 `OpenTrove` message, and one transaction moves their BTC into a full
  MUSD trove and repays the micro loan.
- **HintHelpers and SortedTroves** give the app sorted-list hints for that new trove.
- **BTC** is native gas and collateral on Mezo, so borrowers never wrap anything.

## One deliberate change from RFC-2

RFC-2 pays the liquidator of a matured loan 10% of the collateral. With collateral capped
at 500% of debt, that reward is worth at most half of the debt the liquidator must repay,
so no keeper would ever run it. Microtrove pays BTC worth the debt plus 10%, and the
borrower can claim the rest. A fuzz test checks that this is profitable at every allowed
collateral ratio. See [`contracts/README.md`](contracts/README.md).
