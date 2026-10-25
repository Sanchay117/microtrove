# AKINDO submission: Microtrove (Wave 1)

Text for each field of the AKINDO submission form. Items in [brackets] still need your input.

## Links

| | |
| --- | --- |
| Live project | [live app URL, once the web app is hosted] |
| GitHub | [public repository URL, once pushed] |
| Deck | [deck link, once shared] |
| Pitch video | [video URL] |
| Loan book (`Microtroves`) | https://explorer.test.mezo.org/address/0x6Af91a391C31e85479bd324698c30697EbEC8C77 |
| Lender vault (`MicrotroveVault`) | https://explorer.test.mezo.org/address/0xE128f5F21Adac4a11A22B55Da77bfdb6ab1304e2 |
| Keeper liquidation, live | https://explorer.test.mezo.org/tx/0xfe7a0c608465370d633178d33ef1d7696ad057026eb36172b0f28c32a48dcd51 |

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
- **Lender vault.** An ERC-4626 vault (mtMUSD) that anyone can fund with MUSD. Lenders earn the interest and issuance fees. Withdrawals are instant from idle MUSD, or queued first in, first out and paid as loans are repaid. Every loan matures within one term, so a request waits at most 90 days.
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

- Both contracts are verified on Sourcify with an exact match.
- The vault is seeded with 1,400 MUSD borrowed from a real MUSD trove.
- These flows have run on chain:
  - Borrowing: open, borrow, repay, add and withdraw BTC, close.
  - Lending: deposit, instant withdrawal, queue, cancel, pay out the queue.
  - Liquidation: our keeper bot liquidated a matured loan by itself 48 seconds after its due date, for $3.98 profit after gas and no bad debt. The borrower then claimed the leftover BTC from the web app.
- Promotion is covered by Foundry tests that sign real EIP-712 messages. It has not run live yet because it needs about $2,300 of testnet BTC; it is first on the Wave 2 list.

## Target group

- **Bitcoin holders new to MUSD** who want to try a BTC-backed loan with $50 to $200 instead of committing $2,200 or more. This is mainly retail users, from beginners to intermediate DeFi users, anywhere.
- **MUSD holders** who want a simple fixed-rate yield backed by over-collateralized BTC loans.
- **Keepers and bot operators** who earn by liquidating, with an open-source bot to start from.

The web app is desktop-first and responsive on mobile, and works with any injected EVM wallet. This fits Track 1: it expands MUSD's use as borrowing capital and as productive, yield-earning capital, and feeds borrowers into Mezo's core trove product.

## Tech stack

- **Contracts:** Solidity 0.8.24 and Foundry, with 53 unit, fuzz, EIP-712 and stateful invariant tests. OpenZeppelin 5.1 (ERC-4626, Ownable2Step, Pausable, ReentrancyGuard). Verified on Sourcify.
- **Mezo:** MUSD, PriceFeed, BorrowerOperationsSignatures, HintHelpers, SortedTroves and TroveManager on Mezo Testnet.
- **Web app:** React 19, Vite 7, wagmi 2, viem 2, TanStack Query, plain CSS.
- **Keeper bot:** TypeScript on Node 22+ with viem. Unit-tested planner, simulation before every transaction, and handling for Mezo's RPC quirks.

## Track

Track 1: DeFi (Borrowing, Lending, Looping, and Yield)

## Chain deployed on

Mezo (Mezo Testnet, chain 31611)

## Project status

Entirely new, built during the hackathon.

## Project readiness

Testnet deployment

## Future milestones

1. **Wave 2 (November 2 to 15, 2026).**
   - Run promotion into a full MUSD trove live on testnet.
   - Add one-click repay and close with MUSD permits in the app.
   - Host the keeper around the clock with alerts.
2. **[December 2026].**
   - Independent security review of both contracts.
   - Mezo mainnet beta with a [__] MUSD vault cap.
3. **[Q1 2027].** Offer micro loans where Mezo users already are, as the first step before a full MUSD trove.

## Team info

[Name, role, X or LinkedIn for each member]
