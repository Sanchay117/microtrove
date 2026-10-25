# Microtrove keeper

A bot that keeps the loan book healthy. Every 30 seconds it:

1. Asks `Microtroves.getLiquidatable` for troves that are below the 110% minimum ratio
   or past their due date.
2. Prices each one with `previewLiquidation` and MUSD's own PriceFeed, and drops any
   that would not cover gas plus `MIN_PROFIT_MUSD`.
3. Liquidates the rest, troves below the minimum first (lenders carry that risk),
   then the most profitable, within the MUSD it holds.
4. Pays the vault's first-in, first-out withdrawal queue whenever idle MUSD can fill
   a request.

Healthy troves are never touched. Anyone can run a keeper; the contract pays whoever
calls `liquidate` first.

## Live on Mezo Testnet

On Oct 25, 2026 this keeper liquidated a matured 40 MUSD loan on its own, 36 seconds after
the loan's due date. The term had been shortened to 1 hour for that one borrow so it
would mature during the demo. The run's log, with the startup banner and four 10-minute
status lines (14:11 to 14:42) trimmed:

```
2026-10-25T14:00:50Z  keeper 0xc9Bea2900c81FB0148851Ec6e70E90B848288653, scanning every 30s
2026-10-25T14:00:51Z  BTC $80,253.45 · 1 trove, 0 liquidatable · queue empty · keeper holds 60.00 MUSD and 0.001 BTC
2026-10-25T14:52:29Z  BTC $80,451.30 · 1 trove, 0 liquidatable · queue empty · keeper holds 60.00 MUSD and 0.001 BTC
2026-10-25T15:00:44Z  BTC $80,596.47 · 1 trove, 1 liquidatable · queue empty · keeper holds 60.00 MUSD and 0.001 BTC
2026-10-25T15:00:56Z  approved 60.00 MUSD for the loan book  https://explorer.test.mezo.org/tx/0xf5acc29062201278accc6f83e5b0b7b65c43ccf5c2a089b980f5b2f196c03fda
2026-10-25T15:01:01Z  liquidated 0x9A66...Fb9e (matured): repaid 40.20 MUSD, received 0.00054813 BTC, $3.98 profit after gas  https://explorer.test.mezo.org/tx/0xfe7a0c608465370d633178d33ef1d7696ad057026eb36172b0f28c32a48dcd51
2026-10-25T15:01:01Z    0.00045335 BTC stays claimable by the borrower
```

The borrower then claimed the 0.00045335 BTC from the web app
([transaction](https://explorer.test.mezo.org/tx/0xc3a17a4a897a2284c6d53a65e6dcb524019358363927c54a8b6d67db5d4e568a)).

## What a keeper earns

| Trove | Keeper pays | Keeper receives |
| --- | --- | --- |
| Past its due date | The debt in MUSD | BTC worth the debt plus 10%. The borrower can claim the rest of their BTC. |
| Below 110% | The debt in MUSD | All of the collateral, worth 100% to 110% of the debt |
| Underwater (below 100%) | A reduced amount, so it still earns 5% | All of the collateral. Lenders absorb the shortfall. |

The keeper needs MUSD to repay debts and a little BTC for gas. BTC it receives stays in
its wallet.

## Run it

Needs Node 22.18 or later, which runs the TypeScript sources directly.

```bash
cd keeper
npm install
cp .env.example .env   # then set KEEPER_PRIVATE_KEY
npm start              # scan every 30 seconds until stopped
```

| Command | What it does |
| --- | --- |
| `npm start` | Runs continuously. Ctrl+C stops it after the current scan. |
| `npm run once` | One scan, then exits. Exits with 1 if the scan failed, so it suits cron. |
| `npm run watch` | Runs continuously without sending anything and logs what it would do. |
| `npm test` | Unit tests for the liquidation planner. |

Without `KEEPER_PRIVATE_KEY` the keeper only watches.

| Variable | Default | Meaning |
| --- | --- | --- |
| `KEEPER_PRIVATE_KEY` | none | Wallet that pays MUSD and gas and receives the BTC |
| `RPC_URL` | `https://rpc.test.mezo.org` | Mezo RPC endpoint |
| `POLL_SECONDS` | `30` | Time between scans |
| `MIN_PROFIT_MUSD` | `0.01` | Skip liquidations that earn less than this after gas |
| `MAX_PER_TICK` | `10` | Most liquidations sent per scan |
| `PROCESS_QUEUE` | `true` | Pay queued vault withdrawals |

Contract addresses come from [`deployments/mezo-testnet.json`](../deployments/mezo-testnet.json).

## How it stays safe

- **Simulates first.** Every liquidation is simulated before it is sent, so a borrower who
  repaid or added BTC since the scan costs nothing.
- **Survives Mezo's RPC.** The testnet RPC sometimes returns an empty response to
  `eth_sendRawTransaction` even though the transaction lands. The keeper signs locally,
  knows the hash up front and waits for the receipt either way.
- **Leaves a margin.** It budgets 0.1% above each repayment for interest that accrues
  before the transaction is included.
- **Limits its approval.** It approves MUSD to the loan book only, and only up to its
  own balance. The loan book pulls exactly what each liquidation owes.

## Files

| File | Role |
| --- | --- |
| `src/index.ts` | Scan loop, liquidations and queue payments |
| `src/strategy.ts` | Pure planner: what to liquidate, in what order, within budget |
| `src/chain.ts` | viem clients and a send that tolerates empty RPC responses |
| `src/config.ts` | Environment variables and deployment addresses |
| `src/abi.ts` | The few functions and events the keeper uses |
| `test/strategy.test.ts` | Planner tests: ordering, budget, gas, limits, underwater troves |
