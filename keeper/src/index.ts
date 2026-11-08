import { setTimeout as sleep } from "node:timers/promises";
import { encodeFunctionData, erc20Abi, parseEventLogs, type Address } from "viem";
import { loanBookAbi, priceFeedAbi, vaultAbi } from "./abi.ts";
import { alert, recordScan, saveState, summary } from "./alerts.ts";
import { account, publicClient, send, txUrl } from "./chain.ts";
import { config } from "./config.ts";
import { describe, fmtBtc, fmtMusd, fmtUsd, log, shortAddr } from "./format.ts";
import { MODE_NAMES, ONE, plan, type Candidate, type Scored } from "./strategy.ts";

// A generous upper bound, used only to price gas into the profit check.
const LIQUIDATE_GAS = 300_000n;
// Requests paid per processQueue call.
const QUEUE_BATCH = 20n;
// getLiquidatable page size.
const PAGE = 200n;
// Print the status line at least this often even when nothing changes.
const HEARTBEAT_MS = 10 * 60_000;

const loanBook = { address: config.loanBook, abi: loanBookAbi } as const;
const vault = { address: config.vault, abi: vaultAbi } as const;
const musd = { address: config.musd, abi: erc20Abi } as const;

let lastStatusKey = "";
let lastStatusAt = 0;
const lastSkip = new Map<Address, string>();

async function tick() {
  const keeper = account?.address;
  const [price, borrowerCount, pendingShares, idle, gasPrice, musdBalance, allowance, btcBalance] = await Promise.all([
    publicClient.readContract({ address: config.priceFeed, abi: priceFeedAbi, functionName: "fetchPrice" }),
    publicClient.readContract({ ...loanBook, functionName: "borrowerCount" }),
    publicClient.readContract({ ...vault, functionName: "pendingShares" }),
    publicClient.readContract({ ...vault, functionName: "idleAssets" }),
    publicClient.getGasPrice(),
    keeper ? publicClient.readContract({ ...musd, functionName: "balanceOf", args: [keeper] }) : 0n,
    keeper ? publicClient.readContract({ ...musd, functionName: "allowance", args: [keeper, config.loanBook] }) : 0n,
    keeper ? publicClient.getBalance({ address: keeper }) : 0n,
  ]);

  const found = await findLiquidatable(borrowerCount);
  const previews = found.length
    ? await publicClient.multicall({
        allowFailure: false,
        contracts: found.map((b) => ({ ...loanBook, functionName: "previewLiquidation" as const, args: [b] as const })),
      })
    : [];
  const candidates: Candidate[] = found.map((borrower, i) => ({ borrower, preview: previews[i] }));
  const { liquidate, skipped } = plan({
    candidates,
    price,
    musdBalance,
    gasCost: (gasPrice * LIQUIDATE_GAS * price) / ONE,
    minProfit: config.minProfit,
    maxPerTick: config.maxPerTick,
  });

  const troves = `${borrowerCount} trove${borrowerCount === 1n ? "" : "s"}, ${found.length} liquidatable`;
  const queue = pendingShares > 0n ? `queue waiting with ${fmtMusd(idle)} MUSD idle` : "queue empty";
  const wallet = keeper ? `keeper holds ${fmtMusd(musdBalance)} MUSD and ${fmtBtc(btcBalance)} BTC` : "watching only";
  const key = `${troves}|${queue}|${wallet}`;
  const status = `BTC ${fmtUsd(price)} · ${troves} · ${queue} · ${wallet}`;
  if (key !== lastStatusKey || Date.now() - lastStatusAt > HEARTBEAT_MS) {
    log.info(status);
    lastStatusKey = key;
    lastStatusAt = Date.now();
  }
  summary(`${new Date().toISOString()} · ${status}`);

  if (keeper && !config.dryRun && btcBalance < config.minGasBtc) {
    await alert("warn", "low-gas", `keeper has only ${fmtBtc(btcBalance)} BTC left for gas`, 12);
  }

  // Report each skipped trove once, until its reason changes. A trove nobody will
  // liquidate is a risk to lenders, so the unprofitable and underfunded cases alert.
  for (const s of skipped) {
    const kind = s.reason.startsWith("earns") ? "unprofitable" : s.reason.startsWith("needs") ? "underfunded" : "limit";
    if (kind !== "limit") {
      await alert("warn", `skip:${s.borrower}:${kind}`, `not liquidating ${label(s)}: ${s.reason}`);
    } else if (lastSkip.get(s.borrower) !== s.reason) {
      log.info(`skip ${label(s)}: ${s.reason}`);
    }
    lastSkip.set(s.borrower, s.reason);
  }
  for (const b of lastSkip.keys()) if (!skipped.some((s) => s.borrower === b)) lastSkip.delete(b);

  if (liquidate.length && config.dryRun) {
    for (const c of liquidate) {
      log.info(
        `would liquidate ${label(c)}: repay ${fmtMusd(c.preview.repayAmount)} MUSD for ` +
          `${fmtBtc(c.preview.collateralToLiquidator)} BTC, about ${fmtUsd(c.profit)} profit after gas`,
      );
    }
  } else if (liquidate.length) {
    const needed = liquidate.reduce((sum, c) => sum + c.maxRepay, 0n);
    if (allowance < needed) await approve(musdBalance);
    for (const c of liquidate) await liquidateOne(c, price);
  }

  if (config.processQueue && pendingShares > 0n && idle > 0n) await payQueue();
}

async function findLiquidatable(count: bigint): Promise<Address[]> {
  const found: Address[] = [];
  for (let start = 0n; start < count; start += PAGE) {
    found.push(...(await publicClient.readContract({ ...loanBook, functionName: "getLiquidatable", args: [start, PAGE] })));
  }
  return found;
}

const label = (c: Candidate) => `${shortAddr(c.borrower)} (${MODE_NAMES[c.preview.mode]})`;

async function approve(amount: bigint) {
  // The loan book only pulls what each liquidation owes, so one approval covers the whole balance.
  const receipt = await send(
    config.musd,
    encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [config.loanBook, amount] }),
  );
  log.info(`approved ${fmtMusd(amount)} MUSD for the loan book  ${txUrl(receipt.transactionHash)}`);
}

async function liquidateOne(c: Scored, price: bigint) {
  try {
    // Catches a borrower who repaid or added BTC since the scan, without spending gas.
    await publicClient.simulateContract({ ...loanBook, functionName: "liquidate", args: [c.borrower], account });
  } catch (err) {
    log.info(`skip ${label(c)}: ${describe(err)}`);
    return;
  }
  try {
    const receipt = await send(
      config.loanBook,
      encodeFunctionData({ abi: loanBookAbi, functionName: "liquidate", args: [c.borrower] }),
    );
    const [event] = parseEventLogs({ abi: loanBookAbi, eventName: "Liquidated", logs: receipt.logs });
    const repaid = event?.args.repaid ?? c.preview.repayAmount;
    const received = event?.args.collateralToLiquidator ?? c.preview.collateralToLiquidator;
    const gasPaid = receipt.gasUsed * receipt.effectiveGasPrice;
    const profit = ((received - gasPaid) * price) / ONE - repaid;
    await alert(
      profit < 0n ? "warn" : "info",
      `liq:${receipt.transactionHash}`,
      `liquidated ${label(c)}: repaid ${fmtMusd(repaid)} MUSD, received ${fmtBtc(received)} BTC, ` +
        `${fmtUsd(profit)} ${profit < 0n ? "LOSS" : "profit"} after gas  ${txUrl(receipt.transactionHash)}`,
    );
    if (event?.args.surplus) log.info(`  ${fmtBtc(event.args.surplus)} BTC stays claimable by the borrower`);
  } catch (err) {
    await alert("error", `fail:${c.borrower}`, `liquidating ${label(c)} failed: ${describe(err)}`, 1);
  }
}

async function payQueue() {
  const { result: filled } = await publicClient.simulateContract({
    ...vault,
    functionName: "processQueue",
    args: [QUEUE_BATCH],
    account,
  });
  if (filled === 0n) return;
  if (config.dryRun) {
    log.info(`would pay ${filled} queued withdrawal${filled === 1n ? "" : "s"}`);
    return;
  }
  const receipt = await send(
    config.vault,
    encodeFunctionData({ abi: vaultAbi, functionName: "processQueue", args: [QUEUE_BATCH] }),
  );
  const fills = parseEventLogs({ abi: vaultAbi, eventName: "RedeemRequestFilled", logs: receipt.logs });
  const paid = fills.reduce((sum, e) => sum + e.args.assets, 0n);
  await alert(
    "info",
    `queue:${receipt.transactionHash}`,
    `paid ${fills.length} queued withdrawal${fills.length === 1 ? "" : "s"}, ${fmtMusd(paid)} MUSD  ` +
      txUrl(receipt.transactionHash),
  );
  for (const d of parseEventLogs({ abi: vaultAbi, eventName: "RedeemPaymentDeferred", logs: receipt.logs })) {
    log.info(`  request #${d.args.id} could not be paid to ${shortAddr(d.args.receiver)}; its owner can claim it`);
  }
}

const stop = new AbortController();
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    if (stop.signal.aborted) process.exit(130);
    log.info("stopping after the current scan");
    stop.abort();
  });
}

log.info(`Microtrove keeper · loan book ${config.loanBook} · vault ${config.vault}`);
log.info(
  account
    ? `keeper ${account.address}${config.dryRun ? ", dry run" : ""}, scanning every ${config.pollMs / 1_000}s`
    : "no KEEPER_PRIVATE_KEY, so watching only",
);

log.info(
  config.alertWebhook || config.telegram
    ? `alerts on: ${[config.alertWebhook && "webhook", config.telegram && "Telegram"].filter(Boolean).join(" and ")}`
    : "alerts off: set ALERT_WEBHOOK_URL or the ALERT_TELEGRAM_* variables to enable them",
);

for (;;) {
  try {
    await tick();
    recordScan(true);
  } catch (err) {
    const streak = recordScan(false);
    log.error(`scan failed: ${describe(err)}`);
    summary(`${new Date().toISOString()} · scan failed: ${describe(err)}`);
    if (streak >= config.failureAlertAfter) {
      await alert("error", "scan-failing", `${streak} scans in a row failed, latest: ${describe(err)}`, 1);
    }
    if (config.once) process.exitCode = 1;
  }
  saveState();
  if (config.once || stop.signal.aborted) break;
  try {
    await sleep(config.pollMs, undefined, { signal: stop.signal });
  } catch {
    break;
  }
}
