# Microtrove web app

Borrow, lend and keeper interface for the Microtrove contracts on Mezo Testnet. It reads
addresses from [`../deployments/mezo-testnet.json`](../deployments/mezo-testnet.json),
so a redeploy only needs that file updated.

## What it does

| View | For | Actions |
| --- | --- | --- |
| **Borrow** | Borrowers | Open a micro trove with BTC and borrow 25 to 200 MUSD; repay, borrow more, add or withdraw BTC, close; claim leftover BTC after an expiry liquidation; promote into a full MUSD trove |
| **Lend** | Lenders | Deposit MUSD into the `mtMUSD` vault, withdraw instantly from idle MUSD, or join the FIFO queue; cancel a request; pay out the queue |
| **Keepers** | Liquidators | See every trove with its ratio, due date and status, and liquidate the ones below 110% or past maturity, with the profit shown up front |

Every form previews the result before you sign: new collateral ratio, liquidation price,
fees, interest to maturity, and the exact contract rule that would reject the action.
Validation mirrors `Microtroves.sol` (`src/lib/math.ts`), and contract errors are decoded
into plain messages (`src/lib/errors.ts`).

### Promotion to a full MUSD trove

The Promote panel computes the new trove's debt (requested MUSD + MUSD's borrowing fee +
the 200 MUSD gas deposit) and ratio. It also handles MUSD recovery mode. On submit it:

1. Finds sorted-list hints with MUSD's `HintHelpers.getApproxHint` and
   `SortedTroves.findInsertPosition`.
2. Reads the signing nonce from `BorrowerOperationsSignatures.getNonce`.
3. Asks the wallet to sign MUSD's EIP-712 `OpenTrove` message, with the micro trove's
   collateral plus the top-up as `assetAmount` and `Microtroves` as recipient.
4. Calls `Microtroves.promote`. That opens the MUSD trove, repays the micro loan and sends
   the borrower the rest.

## Run it

```bash
npm install
npm run dev
```

Any injected EVM wallet works. The app asks to add Mezo Testnet (chain 31611) if the wallet
does not have it. Testnet BTC comes from https://faucet.test.mezo.org/.

### Dev burner wallet

For local testing without an extension, put a funded testnet key in
`.env.development.local` (git-ignored):

```
VITE_BURNER_KEY=0x...
```

A "Dev burner" option then appears in the wallet menu. Vite only reads that file in dev
mode, and the connector is compiled out of production builds. `npm run build` output
contains neither the key nor the burner code.

## Build

```bash
npm run build      # type-checks, then writes dist/
npm run abi        # refresh src/abi/ after `forge build` in ../contracts
```

`dist/` is a static site with relative paths, so any static host works.

## Verified on testnet

These flows were run from this UI against the live deployment with the dev burner:
- open and borrow
- repay (with MUSD approval)
- borrow more
- add BTC
- withdraw BTC
- close
- vault deposit
- instant withdrawal
- queueing, cancelling and paying out a queued withdrawal
- claiming leftover BTC after the [keeper](../keeper) liquidated a matured loan

The Liquidate button on the Keepers view and promotion are wired up but have not run
live from the UI yet. Liquidation has run live through the keeper bot. Promotion needs
about $2,300 of testnet BTC. The contract test suite covers both.

## Stack

React 19, Vite 7, wagmi 2 and viem 2 (Mezo Testnet chain definition from `viem/chains`,
Multicall3 batching), TanStack Query, and plain CSS with light and dark themes.
