# Microtrove keeper

A bot that keeps the loan book healthy. On every scan it:

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

It runs around the clock on GitHub Actions, every five minutes, and alerts a chat channel
when something needs a person. Its runs, wallet and on-chain activity are on the app's
[Keepers page](https://microtrove.vercel.app/#keepers).

## Live on Mezo Testnet

On Oct 25, 2026 (on the Wave 1 contracts) this keeper liquidated a matured 40 MUSD loan on its own. It spotted the
loan 36 seconds after its due date, and the liquidation landed in a block 48 seconds after it. The term had been shortened to 1 hour for that one borrow so it
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
| `npm test` | Unit tests for the liquidation planner and the alerts. |

Without `KEEPER_PRIVATE_KEY` the keeper only watches.

| Variable | Default | Meaning |
| --- | --- | --- |
| `KEEPER_PRIVATE_KEY` | none | Wallet that pays MUSD and gas and receives the BTC |
| `RPC_URL` | `https://rpc.test.mezo.org` | Mezo RPC endpoint |
| `POLL_SECONDS` | `30` | Time between scans |
| `MIN_PROFIT_MUSD` | `0.01` | Skip liquidations that earn less than this after gas |
| `MAX_PER_TICK` | `10` | Most liquidations sent per scan |
| `PROCESS_QUEUE` | `true` | Pay queued vault withdrawals |
| `ALERT_WEBHOOK_URL` | none | Discord or Slack incoming webhook for alerts |
| `ALERT_TELEGRAM_BOT_TOKEN`, `ALERT_TELEGRAM_CHAT_ID` | none | Telegram bot and chat for alerts |
| `MIN_GAS_BTC` | `0.0002` | Warn when the keeper holds less BTC than this |
| `FAILURE_ALERT_AFTER` | `3` | Failed scans in a row before an alert |
| `STATE_FILE` | none | Remembers sent alerts and the failure streak between runs |

Contract addresses come from [`deployments/mezo-testnet.json`](../deployments/mezo-testnet.json).

## Alerts

Every alert is logged. With a webhook or a Telegram bot set, it is also posted there.

| Alert | Level | When |
| --- | --- | --- |
| Liquidation failed | error | A liquidation transaction reverted or never landed. Repeats hourly while it keeps failing. |
| Scans failing | error | `FAILURE_ALERT_AFTER` scans in a row failed, for example the RPC is down |
| Liquidation skipped | warn | A trove is liquidatable but would not cover gas plus `MIN_PROFIT_MUSD`, or the keeper lacks the MUSD to repay it |
| Liquidation lost money | warn | A liquidation landed but the BTC received was worth less than the MUSD repaid plus gas |
| Low gas | warn | The keeper's BTC is below `MIN_GAS_BTC` |
| Liquidated, queue paid | info | Each successful liquidation and queue payment, with its transaction |

The same alert is not repeated within six hours (one hour for errors, twelve for low gas),
so a stuck trove does not flood the channel. With `STATE_FILE` set, that memory survives between runs,
which is what makes one-scan-per-run hosting work.

## Hosting

**GitHub Actions** (what Microtrove uses). [`.github/workflows/keeper.yml`](../.github/workflows/keeper.yml)
runs `npm run once` every five minutes and keeps `STATE_FILE` in the Actions cache. A
failed scan fails the run, so it shows red in the run history and on the Keepers page.
Add the secrets once, from the repository root:

```bash
gh secret set KEEPER_PRIVATE_KEY          # paste the testnet key when asked
gh secret set ALERT_WEBHOOK_URL           # optional
gh workflow run keeper.yml                # first run now instead of waiting
```

GitHub may start scheduled runs a few minutes late under load, and pauses them in a
repository with no commits for 60 days.

**Any container host** (Fly.io, Railway, a VPS) for scans every 30 seconds:

```bash
docker build -f keeper/Dockerfile -t microtrove-keeper .   # from the repository root
docker run --env-file keeper/.env microtrove-keeper
```

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
| `src/alerts.ts` | Alerts to a webhook or Telegram, with repeat suppression and the state file |
| `test/strategy.test.ts` | Planner tests: ordering, budget, gas, limits, underwater troves |
| `test/alerts.test.ts` | Alert delivery, repeat suppression and the state file, against a local HTTP sink |
| `Dockerfile` | Always-on container image |
