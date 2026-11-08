import { useState } from "react";
import { useVaultHistory, SEGMENTS, type HistoryPoint } from "../hooks/useVaultHistory";
import { HistoryChart } from "../components/HistoryChart";
import { Card, Segmented, Stat } from "../components/ui";

type Metric = "apy" | "util";

const pct = (bps: number, digits = 2) => `${(bps / 100).toFixed(digits)}%`;
const when = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

/** Time-weighted mean of a metric across the samples. */
function average(points: HistoryPoint[], pick: (p: HistoryPoint) => number) {
  let area = 0;
  let span = 0;
  for (let i = 1; i < points.length; i++) {
    const dt = points[i].time - points[i - 1].time;
    area += pick(points[i - 1]) * dt;
    span += dt;
  }
  return span ? area / span : 0;
}

export function VaultHistory() {
  const { data, isError } = useVaultHistory();
  const [metric, setMetric] = useState<Metric>("apy");
  const points = data ?? [];
  const last = points[points.length - 1];
  const pick = metric === "apy" ? (p: HistoryPoint) => p.apyBps : (p: HistoryPoint) => p.utilizationBps;

  return (
    <Card
      index="2.3"
      title="Vault history"
      className="card-wide"
      aside={
        <Segmented<Metric>
          value={metric}
          onChange={setMetric}
          options={[
            { value: "apy", label: "Supply APY" },
            { value: "util", label: "Utilization" },
          ]}
        />
      }
    >
      <div className="stats">
        <Stat label="Supply APY now" value={last ? pct(last.apyBps) : "-"} sub="Interest, after the protocol fee" />
        <Stat label="Average since launch" value={points.length ? pct(average(points, (p) => p.apyBps)) : "-"} sub={points.length ? `Since ${when.format(new Date(points[0].time * 1000))}` : undefined} />
        <Stat label="Utilization now" value={last ? pct(last.utilizationBps, 1) : "-"} sub="Lent out over vault assets" />
        <Stat label="Average utilization" value={points.length ? pct(average(points, (p) => p.utilizationBps), 1) : "-"} sub="Time-weighted" />
      </div>
      {isError ? (
        <div className="chart-empty">History could not be loaded from the Mezo RPC. It retries every few minutes.</div>
      ) : (
        <HistoryChart
          points={points.map((p) => ({ time: p.time, value: pick(p), segment: p.segment }))}
          format={(v) => pct(v, metric === "apy" ? 2 : 1)}
          axisFormat={(v) => `${Number((v / 100).toFixed(2))}%`}
          label={metric === "apy" ? "Supply APY" : "Utilization"}
          segmentLabels={SEGMENTS.map((s) => s.label)}
          unitStep={metric === "apy" ? 100 : 1_000}
        />
      )}
      <details className="table-toggle">
        <summary>Show as table</summary>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Time</th>
                <th>Vault</th>
                <th className="num">Supply APY</th>
                <th className="num">Utilization</th>
                <th className="num">Assets</th>
                <th className="num">MUSD per mtMUSD</th>
              </tr>
            </thead>
            <tbody>
              {[...points].reverse().map((p) => (
                <tr key={p.block.toString()}>
                  <td>{when.format(new Date(p.time * 1000))}</td>
                  <td>{SEGMENTS[p.segment].label}</td>
                  <td className="num">{pct(p.apyBps)}</td>
                  <td className="num">{pct(p.utilizationBps, 1)}</td>
                  <td className="num">{p.totalAssets.toLocaleString("en-US", { maximumFractionDigits: 0 })}</td>
                  <td className="num">{p.sharePrice.toFixed(6)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
      <p className="fine">
        Read from chain at past blocks. Supply APY is what open loans pay lenders per year, after the 10% protocol fee,
        over everything in the vault. Lenders also earn the 0.5% issuance fee on each loan, which shows up in the share
        price. The Wave 1 vault was retired on Nov 7 after a security fix and its lenders moved to the current one.
      </p>
    </Card>
  );
}
