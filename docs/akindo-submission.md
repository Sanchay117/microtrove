# AKINDO submission: Microtrove (Wave 2)

Text for each field of the AKINDO submission form. Items in [brackets] still need your input.

## Updates in this Wave

Wave 2 answers every point in the Wave 1 review and ships all five Wave 2 commitments but one, which is waiting on testnet BTC.

**Review fixes**
- **Critical: the redeem queue can no longer be frozen.** A lender could queue a withdrawal with MUSD itself as the receiver; MUSD refuses transfers to itself, so `processQueue` would revert forever. `requestRedeem` now rejects MUSD and the vault as receivers, and any payment that is still refused becomes a claim for its owner while the queue moves on. Covered by unit tests, the invariant suite (one request in four goes to a receiver that refuses MUSD) and a fork test against real MUSD.
- **Promotion against real MUSD contracts.** Six Foundry fork tests run on Mezo Testnet's live contracts: promotion through `BorrowerOperationsSignatures.openTroveWithSignature`, a rejected signature, closing with a real MUSD permit, the queue fix and a keeper liquidation. Run them with `MEZO_FORK=1 forge test --match-path "test/fork/*"`.
- **A protocol fee.** 10% of interest now goes to the protocol, like a reserve factor; lenders keep 90% plus every issuance fee. Anyone can send the protocol's share to its fee recipient, so a broken recipient can never block a repayment.
- **Redeployed and verified.** New loan book and vault, exact match on Sourcify. The Wave 1 contracts were emptied and paused.
- **A deck and more wallets.** A 12-slide deck, and a wallet picker that lists every EIP-6963 wallet with its icon, plus Coinbase Wallet, WalletConnect and an open-in-MetaMask link on phones.

**Wave 2 commitments**
- **One-click repay and close:** the app signs an EIP-2612 permit for MUSD, so repaying is one signature and one transaction.
- **Keeper hosted around the clock:** a GitHub Actions workflow scans every five minutes and alerts Discord, Slack or Telegram on failed or unprofitable liquidations, failing scans and low gas. The Keepers page shows its runs, its wallet and every liquidation and queue payment since launch.
- **Lender dashboard:** supply APY and utilization history read from chain since launch, with a table view, and each lender's place in the withdrawal queue with the MUSD ahead of them.
- **Guided first loan and mobile polish:** a four-step guide that checks itself off from live wallet state, explains the loan the user is about to take, and includes a short MUSD glossary. Every page fits a 375px phone screen.
- **Live promotion from the web app:** [done, with transaction links / waiting for testnet BTC for the full trove].

## Links

| | |
| --- | --- |
| Live project | https://microtrove.vercel.app |
| GitHub | https://github.com/Sanchay117/microtrove |
| Deck | https://claude.ai/artifact/KBA2DRVGLdXY3sT8kkgfsS (share it publicly first) |
| Pitch video | https://youtu.be/pOMobneJlXk |
| Loan book (`Microtroves`) | https://explorer.test.mezo.org/address/0xE0e2155f9C5a5B55eADf952d0a01d3E691092dcf |
| Lender vault (`MicrotroveVault`) | https://explorer.test.mezo.org/address/0x11fc55CD01411bd1453EE62b40cB4e653f7726eA |
| Keeper liquidation, live (Wave 1 contracts) | https://explorer.test.mezo.org/tx/0xfe7a0c608465370d633178d33ef1d7696ad057026eb36172b0f28c32a48dcd51 |
| Keeper runs | https://github.com/Sanchay117/microtrove/actions/workflows/keeper.yml |

## Project name

Microtrove

## Project category

BTC-backed MUSD microloans

## TL;DR

Microtrove lets anyone borrow 25 to 200 MUSD against a little bitcoin, funded by an open MUSD lender vault, and promote the loan into a full MUSD trove in one transaction.

## How it works

**The problem.** An MUSD trove needs at least 1,800 MUSD of debt plus a 200 MUSD gas deposit. At the 110% minimum ratio, trying MUSD for the first time means locking about $2,200 of bitcoin. Most people want to start smaller, so they never try it.

**The solution.** Mezo already designed small loans in RFC-2, "Lending Arbitrage Microloans", but never shipped it. Microtrove implements RFC-2 and adds the open lender vault that RFC-2 lists as future work:

- **Micro troves.** Borrow 25 to 200 MUSD against BTC at a fixed 5% APR for a 90-day term, with a 0.5% issuance fee. The smallest loan needs $27.50 of BTC at 110%, or about $50 at a comfortable 200%. Repay any time. Loans below 110%, or past their due date, can be liquidated.
- **Lender vault.** An ERC-4626 vault (mtMUSD) that anyone can fund with MUSD. Lenders earn 90% of the interest and all issuance fees; the protocol keeps 10% of the interest. Withdrawals are instant from idle MUSD, or queued first in, first out and paid as loans are repaid. Every loan matures within one term, so a request waits at most 90 days.
- **Promotion.** When a borrower outgrows a micro trove, they sign MUSD's own EIP-712 `OpenTrove` message. One transaction moves their BTC into a full MUSD trove through `BorrowerOperationsSignatures.openTroveWithSignature`, repays the micro loan from the new trove's MUSD, and sends them the rest.
- **Keepers.** Anyone can liquidate an unhealthy or matured loan for profit. Our open-source keeper bot does this automatically and also pays out the withdrawal queue.

**How we use MUSD and Mezo.**

- MUSD is the loan currency and the vault asset, with EIP-2612 permits for one-step repay and close.
- MUSD's PriceFeed prices BTC for every collateral check and liquidation.
- Promotion opens real MUSD troves through `BorrowerOperationsSignatures`.
- The app finds sorted-list hints with HintHelpers and SortedTroves, and checks recovery mode with TroveManager.
- BTC is native gas and collateral on Mezo, so nobody wraps anything.

We position Microtrove as an on-ramp to MUSD rather than a competitor. It lets a newcomer start with $50, and every borrower who grows becomes a full MUSD trove.

**One deliberate change from RFC-2.** RFC-2 pays the liquidator of a matured loan 10% of the collateral. With collateral capped at 500% of debt, that reward is worth at most half the debt the liquidator must repay, so no keeper would ever run it. Microtrove pays BTC worth the debt plus 10%, and the borrower claims the rest. A fuzz test checks that this is profitable at every allowed ratio.

**What has run live on Mezo Testnet.**

- Both Wave 2 contracts are verified on Sourcify with an exact match.
- The vault is seeded with 1,500 MUSD borrowed from a real MUSD trove.
- These flows ran on chain on the Wave 1 contracts:
  - Borrowing: open, borrow, repay, add and withdraw BTC, close.
  - Lending: deposit, instant withdrawal, queue, cancel, pay out the queue.
  - Liquidation: our keeper bot liquidated a matured loan by itself 48 seconds after its due date, for $3.98 profit after gas and no bad debt. The borrower then claimed the leftover BTC from the web app.
- Promotion is covered by fork tests against Mezo's live contracts with real EIP-712 signatures. [Live run: transaction links.]

## Target group

- **Bitcoin holders new to MUSD** who want to try a BTC-backed loan with $50 to $200 instead of committing $2,200 or more. This is mainly retail users, from beginners to intermediate DeFi users, anywhere.
- **MUSD holders** who want a simple fixed-rate yield backed by over-collateralized BTC loans.
- **Keepers and bot operators** who earn by liquidating, with an open-source bot to start from.

The web app works on desktop and phones, with any EIP-6963 wallet, Coinbase Wallet or WalletConnect, and walks a newcomer through their first loan. This fits Track 1: it expands MUSD's use as borrowing capital and as productive, yield-earning capital, and feeds borrowers into Mezo's core trove product.

## Tech stack

- **Contracts:** Solidity 0.8.24 and Foundry, with 59 unit, fuzz, EIP-712 and stateful invariant tests plus 6 fork tests against Mezo Testnet. OpenZeppelin 5.1 (ERC-4626, Ownable2Step, Pausable, ReentrancyGuard). Verified on Sourcify.
- **Mezo:** MUSD, PriceFeed, BorrowerOperationsSignatures, HintHelpers, SortedTroves and TroveManager on Mezo Testnet.
- **Web app:** React 19, Vite 7, wagmi 2, viem 2, TanStack Query, plain CSS.
- **Keeper bot:** TypeScript on Node 22+ with viem. Unit-tested planner, simulation before every transaction, handling for Mezo's RPC quirks, alerts to Discord, Slack or Telegram, hosted on GitHub Actions.

## Track

Track 1: DeFi (Borrowing, Lending, Looping, and Yield)

## Chain deployed on

Mezo (Mezo Testnet, chain 31611)

## Project status

Entirely new, built during the hackathon.

## Project readiness

Testnet deployment

## Future milestones

1. **Wave 3.**
   - First outside borrowers and lenders, invited through the Mezo community.
   - Mezo Passport, so Bitcoin wallets can borrow.
2. **[December 2026].**
   - Independent security review of both contracts.
   - Mezo mainnet beta with a [__] MUSD vault cap.
3. **[Q1 2027].** Offer micro loans where Mezo users already are, as the first step before a full MUSD trove.

## Team info

[Name, role, X or LinkedIn for each member]
