import { useAccount, useBalance, useReadContract, useReadContracts, useWriteContract } from "wagmi";
import { erc20Abi, type Address } from "viem";
import { addresses, addressUrl, txUrl } from "../config";
import { loans, usePrice, useProtocol } from "../hooks/useProtocol";
import { useAccountState } from "../hooks/useAccountState";
import { KEEPER, REPO, useKeeperActivity, useKeeperRuns } from "../hooks/useKeeperActivity";
import { useNow } from "../hooks/useNow";
import { useTx } from "../tx";
import { Card, Kicker, Stat, healthTone } from "../components/ui";
import { collateralValue, icr } from "../lib/math";
import { fmtBps, fmtBtc, fmtDuration, fmtMusd, fmtRatio, fmtUsd, shortAddr } from "../lib/format";

// Microtroves.LiquidationMode
const MODE = ["Healthy", "Below minimum", "Matured"] as const;

export function Keepers() {
  const { price } = usePrice();
  const { data: protocol } = useProtocol();
  const count = protocol?.borrowerCount ?? 0n;

  const borrowers = useReadContract({
    ...loans,
    functionName: "getBorrowers",
    args: [0n, count],
    query: { enabled: count > 0n, refetchInterval: 10_000 },
  });
  const list = (borrowers.data ?? []) as readonly Address[];
  const details = useReadContracts({
    allowFailure: false,
    contracts: list.flatMap((b) => [
      { ...loans, functionName: "getTrove" as const, args: [b] as const },
      { ...loans, functionName: "previewLiquidation" as const, args: [b] as const },
    ]),
    query: { enabled: list.length > 0, refetchInterval: 10_000 },
  });

  if (!protocol || price === undefined) return <div className="loading">Loading troves...</div>;
  const { params } = protocol;

  const rows = list
    .map((borrower, i) => {
      const trove = details.data?.[2 * i] as readonly [boolean, bigint, bigint, bigint, bigint, bigint | number, number, number] | undefined;
      const preview = details.data?.[2 * i + 1] as
        | { mode: number; debt: bigint; repayAmount: bigint; collateralToLiquidator: bigint; surplus: bigint }
        | undefined;
      if (!trove || !preview) return undefined;
      return {
        borrower,
        collateral: trove[1],
        debt: trove[4],
        maturity: BigInt(trove[5]),
        ratio: icr(trove[1], trove[4], price),
        preview,
      };
    })
    .filter((r) => r !== undefined)
    .sort((a, b) => b.preview.mode - a.preview.mode || Number((a.ratio ?? 0n) - (b.ratio ?? 0n)) / 1e16);
  const liquidatable = rows.filter((r) => r.preview.mode !== 0);

  return (
    <div className="page">
      <section className="intro">
        <Kicker index="03" label="Keepers" />
        <h1>
          Keep the loan book <em>healthy.</em>
        </h1>
        <p>
          Anyone can liquidate a trove that falls below {fmtRatio(params.mcr, 0)} or passes its due date. You repay the
          debt in MUSD and receive BTC: all of the collateral below the minimum, or the debt plus{" "}
          {fmtBps(params.expiryBonusBps)} at maturity. The keeper bot in this repo does it automatically.
        </p>
      </section>

      <div className="specs">
        <div className="spec">
          <span className="spec-k">Open troves</span>
          <span className="spec-v">{count.toString()}</span>
          <span className="spec-s">Every one is listed below</span>
        </div>
        <div className="spec">
          <span className="spec-k">BTC collateral</span>
          <span className="spec-v">{fmtBtc(protocol.totalCollateral)}<small>BTC</small></span>
          <span className="spec-s">{fmtUsd(collateralValue(protocol.totalCollateral, price))}</span>
        </div>
        <div className="spec">
          <span className="spec-k">MUSD owed</span>
          <span className="spec-v">{fmtMusd(protocol.totalDebt, 0)}<small>MUSD</small></span>
          <span className="spec-s">Principal plus interest</span>
        </div>
        <div className="spec">
          <span className="spec-k">Liquidatable now</span>
          <span className={`spec-v ${liquidatable.length ? "tone-bad" : ""}`}>{liquidatable.length}</span>
          <span className="spec-s">
            {liquidatable.length ? "Below the minimum or matured" : "Nothing to liquidate"}
          </span>
        </div>
      </div>

      <div className="grid-2">
        <BotStatus />
        <KeeperWallet price={price} />
      </div>

      <Card index="3.3" title="Troves">
        {rows.length === 0 ? (
          <p className="muted">No open troves yet.</p>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Borrower</th>
                  <th className="num">Collateral</th>
                  <th className="num">Debt</th>
                  <th className="num">Ratio</th>
                  <th className="num">Due</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <TroveRow key={r.borrower} row={r} price={price} mcr={params.mcr} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <ActivityCard price={price} />
    </div>
  );
}

const ago = (unix: number, now: number) => (now - unix < 60 ? "just now" : `${fmtDuration(now - unix)} ago`);

function BotStatus() {
  const now = useNow();
  const { data: runs, isError } = useKeeperRuns();
  const last = runs?.[0];
  const recent = runs ?? [];
  const failed = recent.filter((r) => r.conclusion === "failure").length;
  const lastOk = recent.find((r) => r.conclusion === "success");

  return (
    <Card index="3.1" title="Hosted keeper" aside={<span className="badge">every 5 min</span>}>
      {runs === null ? (
        <p className="muted">
          The hosted keeper starts once its GitHub Actions workflow is enabled. Until then, run it yourself with{" "}
          <code>npm start</code> in <code>keeper/</code>.
        </p>
      ) : isError ? (
        <p className="muted">GitHub did not answer. The run history is on GitHub.</p>
      ) : !runs ? (
        <p className="muted">Loading the bot's runs...</p>
      ) : !last ? (
        <p className="muted">No runs yet. Each scheduled scan shows here once GitHub starts it.</p>
      ) : (
        <>
          <div className="stats stats-2">
            <Stat
              label="Last scan"
              value={last.status === "completed" ? ago(last.createdAt, now) : "Running"}
              sub={
                last.conclusion === "failure"
                  ? "Failed, alert sent"
                  : last.conclusion === "success"
                    ? "Succeeded"
                    : "In progress"
              }
              tone={last.conclusion === "failure" ? "bad" : undefined}
            />
            <Stat
              label="Recent runs"
              value={`${recent.length - failed} of ${recent.length}`}
              sub={lastOk ? `succeeded; last success ${ago(lastOk.createdAt, now)}` : "succeeded"}
              tone={failed > 2 ? "warn" : undefined}
            />
          </div>
          <div className="runs" aria-label="Recent runs, newest first">
            {recent.map((r) => (
              <a
                key={r.url}
                href={r.url}
                target="_blank"
                rel="noreferrer"
                className={`run run-${r.conclusion ?? "pending"}`}
                title={`${new Date(r.createdAt * 1000).toLocaleString("en-US")}: ${r.conclusion ?? r.status}`}
              />
            ))}
          </div>
        </>
      )}
      <p className="fine">
        The open-source keeper in <code>keeper/</code> runs on GitHub Actions: it liquidates matured and
        undercollateralized loans for profit and pays the withdrawal queue. A failed or unprofitable liquidation, a
        failing scan or low gas sends an alert.{" "}
        <a href={`https://github.com/${REPO}/actions/workflows/keeper.yml`} target="_blank" rel="noreferrer">
          Run history
        </a>
      </p>
    </Card>
  );
}

function KeeperWallet({ price }: { price: bigint }) {
  const btc = useBalance({
    address: KEEPER,
    query: { refetchInterval: 30_000 },
  });
  const musd = useReadContract({
    address: addresses.musd,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [KEEPER],
    query: { refetchInterval: 30_000 },
  });
  return (
    <Card index="3.2" title="Keeper wallet">
      <div className="stats stats-2">
        <Stat label="MUSD to repay debts" value={`${fmtMusd(musd.data)}`} sub="Caps what it can liquidate at once" />
        <Stat
          label="BTC for gas and rewards"
          value={fmtBtc(btc.data?.value, 6)}
          sub={btc.data ? fmtUsd(collateralValue(btc.data.value, price)) : undefined}
        />
      </div>
      <p className="fine">
        <a href={addressUrl(KEEPER)} target="_blank" rel="noreferrer" className="mono">
          {KEEPER}
        </a>
        <br />
        Anyone can run a keeper. The contract pays whoever calls <code>liquidate</code> first.
      </p>
    </Card>
  );
}

const MODE_LABEL = ["", "below 110%", "matured"];

function ActivityCard({ price }: { price: bigint }) {
  const now = useNow();
  const { data, isLoading, isError, olderLoading, olderError } = useKeeperActivity();
  const rows = data ?? [];
  const liquidations = rows.filter((r) => r.kind === "liquidation");
  const byKeeper = rows.filter((r) => r.byKeeper).length;

  return (
    <Card index="3.4" title="Keeper activity" aside={<span className="badge">{rows.length} on chain</span>}>
      {isLoading ? (
        <p className="muted">Reading events since launch...</p>
      ) : isError ? (
        <p className="muted">Could not read events from the Mezo RPC. Retrying shortly.</p>
      ) : rows.length === 0 && !olderLoading ? (
        <p className="muted">No liquidations or queue payments yet.</p>
      ) : (
        <>
          <p className="fine activity-sum">
            {liquidations.length} liquidation
            {liquidations.length === 1 ? "" : "s"} and {rows.length - liquidations.length} queue payment
            {rows.length - liquidations.length === 1 ? "" : "s"} since launch, {byKeeper} by the keeper bot.
            {olderLoading && " Reading the Wave 1 contracts..."}
            {olderError && " The Wave 1 contracts could not be read right now."}
          </p>
          {rows.length > 0 && (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>When</th>
                    <th>What</th>
                    <th className="num">Paid</th>
                    <th className="num">Received</th>
                    <th>By</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(0, 25).map((r) => (
                    <tr key={r.hash}>
                      <td title={new Date(r.time * 1000).toLocaleString("en-US")}>{ago(r.time, now)}</td>
                      <td>
                        {r.kind === "liquidation" ? (
                          <>
                            Liquidated {shortAddr(r.borrower)}, {MODE_LABEL[r.mode]}
                            {r.badDebt > 0n && <span className="tone-bad"> ({fmtMusd(r.badDebt)} MUSD bad debt)</span>}
                          </>
                        ) : (
                          <>
                            Paid {r.requests} queued withdrawal
                            {r.requests === 1 ? "" : "s"}
                          </>
                        )}
                        {r.wave1 && <span className="badge badge-sm">Wave 1</span>}
                      </td>
                      <td className="num">{fmtMusd(r.kind === "liquidation" ? r.repaid : r.assets)} MUSD</td>
                      <td className="num">
                        {r.kind === "liquidation" ? (
                          <span title={`${fmtUsd(collateralValue(r.received, price))} at today's price`}>
                            {fmtBtc(r.received, 8)} BTC
                          </span>
                        ) : (
                          "-"
                        )}
                      </td>
                      <td>{r.byKeeper ? "Keeper bot" : <span className="mono">{shortAddr(r.by)}</span>}</td>
                      <td className="num">
                        <a href={txUrl(r.hash)} target="_blank" rel="noreferrer">
                          Tx
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </Card>
  );
}

function TroveRow({ row, price, mcr }: {
  row: {
    borrower: Address;
    collateral: bigint;
    debt: bigint;
    maturity: bigint;
    ratio: bigint | undefined;
    preview: { mode: number; repayAmount: bigint; collateralToLiquidator: bigint };
  };
  price: bigint;
  mcr: bigint;
}) {
  const now = useNow();
  const { address } = useAccount();
  const { data: account } = useAccountState();
  const { run, ensureAllowance, busy } = useTx();
  const { writeContractAsync } = useWriteContract();
  const { preview } = row;
  const reward = collateralValue(preview.collateralToLiquidator, price);
  const profit = reward - preview.repayAmount;
  const own = address?.toLowerCase() === row.borrower.toLowerCase();
  const short = (account?.musd ?? 0n) < preview.repayAmount;
  const remaining = row.maturity > 0n ? Number(row.maturity) - now : undefined;

  const liquidate = async () => {
    // Interest keeps accruing until the transaction lands.
    const allowance = (preview.repayAmount * 1_001n) / 1_000n;
    if (!(await ensureAllowance(addresses.musd, addresses.loans, allowance, "Approve MUSD"))) return;
    await run(`Liquidate ${shortAddr(row.borrower)}`, () =>
      writeContractAsync({ ...loans, functionName: "liquidate", args: [row.borrower] }),
    );
  };

  return (
    <tr className={preview.mode !== 0 ? "row-hot" : ""}>
      <td>
        <a href={addressUrl(row.borrower)} target="_blank" rel="noreferrer" className="mono">
          {shortAddr(row.borrower)}
        </a>
        {own && <span className="badge badge-sm">you</span>}
      </td>
      <td className="num">{fmtBtc(row.collateral)}</td>
      <td className="num">{fmtMusd(row.debt)}</td>
      <td className={`num tone-${healthTone(row.ratio, mcr)}`}>{row.debt > 0n ? fmtRatio(row.ratio) : "-"}</td>
      <td className="num">{remaining === undefined ? "-" : remaining <= 0 ? "Matured" : fmtDuration(remaining)}</td>
      <td>
        <span className={`status status-${preview.mode}`}>{MODE[preview.mode]}</span>
      </td>
      <td className="num">
        {preview.mode !== 0 && (
          <button
            className="btn btn-primary btn-sm"
            disabled={busy || !address || short}
            title={`Pay ${fmtMusd(preview.repayAmount)} MUSD, receive ${fmtBtc(preview.collateralToLiquidator)} BTC`}
            onClick={liquidate}
          >
            {short ? `Need ${fmtMusd(preview.repayAmount)} MUSD` : `Liquidate, +${fmtUsd(profit)}`}
          </button>
        )}
      </td>
    </tr>
  );
}
