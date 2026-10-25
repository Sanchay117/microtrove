import { useAccount, useReadContract, useReadContracts, useWriteContract } from "wagmi";
import type { Address } from "viem";
import { addresses, addressUrl } from "../config";
import { loans, usePrice, useProtocol } from "../hooks/useProtocol";
import { useAccountState } from "../hooks/useAccountState";
import { useNow } from "../hooks/useNow";
import { useTx } from "../tx";
import { Card, Kicker, healthTone } from "../components/ui";
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

      <Card index="3.1" title="Troves">
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
    </div>
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
