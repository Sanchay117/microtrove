# Microtrove

**Borrow 25 to 200 MUSD against bitcoin on Mezo, funded by anyone who lends MUSD.**

[Try it on Mezo Testnet](https://microtrove.vercel.app) · [Watch the two-minute demo](https://youtu.be/pOMobneJlXk) · [Read the deck](https://drive.google.com/file/d/1yaoCXQWbPMoU9BGECrD_E65BFebfAubH/view?usp=sharing)

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
| Loan book (`Microtroves`) | [`0xE0e2155f9C5a5B55eADf952d0a01d3E691092dcf`](https://explorer.test.mezo.org/address/0xE0e2155f9C5a5B55eADf952d0a01d3E691092dcf) |
| Lender vault (`MicrotroveVault`, mtMUSD) | [`0x11fc55CD01411bd1453EE62b40cB4e653f7726eA`](https://explorer.test.mezo.org/address/0x11fc55CD01411bd1453EE62b40cB4e653f7726eA) |

Both are verified on Sourcify and wired to the live MUSD, PriceFeed and
BorrowerOperationsSignatures contracts. The vault is seeded with 1,500 MUSD borrowed from a
real MUSD trove.

Promotion has run live on these contracts from the web app. A 100 MUSD micro loan became a full
MUSD trove with 1,800 MUSD of debt and 0.0423 BTC in
[one transaction](https://explorer.test.mezo.org/tx/0x9f1a1aae9d3d0106e48dddae8ef4bf22c4e48cebad975a48c9f05dae139b9642),
which repaid the micro loan and sent the borrower the other 1,699.50 MUSD.

These are the Wave 2 contracts, redeployed after the Wave 1 review. The Wave 1 pair was
emptied and paused; its addresses and every transaction are kept under `wave1` in
[`deployments/mezo-testnet.json`](deployments/mezo-testnet.json). On those contracts, every
step ran on chain:
- A borrower opened, borrowed, repaid and closed a loan.
- Lenders deposited and withdrew, both instantly and through the queue.
- The [keeper bot](keeper) liquidated a matured loan
  [48 seconds after its due date](https://explorer.test.mezo.org/tx/0xfe7a0c608465370d633178d33ef1d7696ad057026eb36172b0f28c32a48dcd51),
  for a $3.98 profit. It was a demo loan whose term we cut to one hour so it would mature
  during the run.
- The borrower claimed the rest of their BTC from the web app.

The app's Keepers page lists every liquidation and queue payment across both deployments.

## What changed in Wave 2

| Wave 1 review | Wave 2 |
| --- | --- |
| **Critical:** a lender could queue a withdrawal with MUSD itself as the receiver. MUSD refuses transfers to itself, so `processQueue` would revert forever and stop all withdrawals. | `requestRedeem` rejects MUSD and the vault as receivers. If a payment is still refused, the shares are burned, the MUSD is set aside for the owner to `claim`, and the queue moves on. Tested against real MUSD on a fork. |
| Promotion through `openTroveWithSignature` had never run against Mezo's contracts. | Six fork tests run against Mezo Testnet's live contracts: a lender's MUSD from a real trove, promotion, rejecting a signature made for other amounts, closing with a real MUSD permit, the queue fix and a keeper liquidation. Promotion has also run live from the web app ([transaction](https://explorer.test.mezo.org/tx/0x9f1a1aae9d3d0106e48dddae8ef4bf22c4e48cebad975a48c9f05dae139b9642)). |
| The protocol fee was 0. | 10% of interest goes to the protocol, like a reserve factor. Lenders keep 90% plus every issuance fee. |
| No deck, injected wallets only. | [A short deck](https://drive.google.com/file/d/1yaoCXQWbPMoU9BGECrD_E65BFebfAubH/view?usp=sharing). The app lists every EIP-6963 wallet with its icon, plus Coinbase Wallet, WalletConnect and a link that opens it in MetaMask on phones. |

And the Wave 2 commitments:
- **Promotion live from the web app.** The borrower signed MUSD's `OpenTrove` message and
  [one transaction](https://explorer.test.mezo.org/tx/0x9f1a1aae9d3d0106e48dddae8ef4bf22c4e48cebad975a48c9f05dae139b9642)
  opened a full MUSD trove with 1,800 MUSD of debt, repaid their 100 MUSD micro loan and sent
  them 1,699.50 MUSD.
- **One-click repay and close.** The app signs an EIP-2612 permit for MUSD, so a repayment is one
  signature and one transaction. Smart-contract wallets fall back to an approval.
- **Hosted keeper with alerts.** A GitHub Actions workflow runs the keeper every five minutes
  and alerts a Discord, Slack or Telegram channel on failed or unprofitable liquidations,
  repeated scan failures and low gas. The Keepers page shows the bot's runs, its wallet and
  its on-chain activity.
- **Lender dashboard.** APY and utilization history read from chain since launch, each
  lender's place in the withdrawal queue and the MUSD ahead of them.
- **A guided first loan** for people new to MUSD, which checks off each step from live
  wallet state and explains the numbers they pick, plus a phone layout.

## How it sustains itself

A 100 MUSD loan held for its 90-day term at 5% pays 1.24 MUSD of interest: 1.12 to lenders
and 0.12 to the protocol. Lenders also keep the 0.50 MUSD issuance fee. Anyone can send the
protocol's share to its fee recipient with `withdrawProtocolFees`.

- **Lenders** earn 90% of interest and all issuance fees, on loans backed by at least 110% in BTC.
- **Keepers** are paid by the loans they close: BTC worth the debt plus 10% for a matured
  loan, all the collateral below 110%. No subsidy is needed.
- **Running costs** are close to zero: the app is static, the keeper runs on GitHub Actions
  and pays its own gas from liquidations.
- **Mezo** gains a trove of at least 1,800 MUSD every time a borrower promotes.

## Repository

| Folder | What is in it |
| --- | --- |
| [`contracts/`](contracts) | Foundry project: loan book, vault, 59 tests (unit, fuzz, EIP-712, stateful invariants) and 6 fork tests against Mezo Testnet, deploy script |
| [`web/`](web) | React app with Borrow, Lend and Keepers views |
| [`keeper/`](keeper) | Bot that liquidates matured and undercollateralized loans for profit and pays the vault's withdrawal queue, with alerts |
| [`deployments/`](deployments) | Addresses, parameters and transaction hashes shared by the app, the keeper and scripts |
| [`.github/workflows/keeper.yml`](.github/workflows/keeper.yml) | Runs the keeper every five minutes |

## Quick start

```bash
git submodule update --init --recursive   # forge-std and OpenZeppelin 5.1.0
(cd contracts && forge test)
(cd contracts && MEZO_FORK=1 forge test --match-path "test/fork/*")   # against Mezo Testnet
(cd keeper && npm install && npm test && npm run watch)
(cd web && npm install && npm run dev)
```

## How it uses Mezo

- **MUSD** is the loan currency and the vault asset. Its EIP-2612 permits make repay and
  close one transaction.
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
