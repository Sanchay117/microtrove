import { useEffect, useMemo, useState, type KeyboardEvent, type PointerEvent } from "react";

export type ChartPoint = { time: number; value: number; segment: number };

const H = 220;
const PAD = { top: 18, right: 56, bottom: 26, left: 44 };

const dayFmt = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });
const fullFmt = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

/** Clean y ticks from 0 to just above the max. */
function ticks(max: number, unitStep: number): number[] {
  const raw = Math.max(max, unitStep) / 4;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 5, 10].map((m) => m * pow).find((s) => s >= raw) ?? raw;
  const out = [];
  for (let v = 0; v <= max + step * 0.001 || out.length < 2; v += step) out.push(Number(v.toFixed(10)));
  return out;
}

/**
 * One series over time: 2px line, 10% wash, hairline grid, an end dot with its value,
 * and a crosshair that snaps to the nearest sample (pointer or arrow keys). A vertical
 * rule marks where one segment hands over to the next.
 */
export function HistoryChart({ points, format, axisFormat = format, label, segmentLabels, unitStep = 1 }: {
  points: ChartPoint[];
  format: (v: number) => string;
  axisFormat?: (v: number) => string;
  label: string;
  segmentLabels: string[];
  unitStep?: number;
}) {
  // A callback ref: the wrapper only mounts once there is data, after the first render.
  const [wrap, setWrap] = useState<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(640);
  const [active, setActive] = useState<number | null>(null);

  useEffect(() => {
    if (!wrap) return;
    setWidth(Math.max(220, wrap.clientWidth));
    const ro = new ResizeObserver(([e]) => setWidth(Math.max(220, e.contentRect.width)));
    ro.observe(wrap);
    return () => ro.disconnect();
  }, [wrap]);

  const geo = useMemo(() => {
    if (points.length < 2) return undefined;
    const t0 = points[0].time;
    const t1 = points[points.length - 1].time;
    const yTicks = ticks(Math.max(...points.map((p) => p.value)), unitStep);
    const yMax = yTicks[yTicks.length - 1] || 1;
    const iw = width - PAD.left - PAD.right;
    const ih = H - PAD.top - PAD.bottom;
    const x = (t: number) => PAD.left + ((t - t0) / (t1 - t0 || 1)) * iw;
    const y = (v: number) => PAD.top + ih - (v / yMax) * ih;
    const segments = [...new Set(points.map((p) => p.segment))].map((s) => points.filter((p) => p.segment === s));
    const line = (ps: ChartPoint[]) => ps.map((p, i) => `${i ? "L" : "M"}${x(p.time).toFixed(1)},${y(p.value).toFixed(1)}`).join("");
    const area = (ps: ChartPoint[]) =>
      `${line(ps)}L${x(ps[ps.length - 1].time).toFixed(1)},${y(0)}L${x(ps[0].time).toFixed(1)},${y(0)}Z`;
    const days = (t1 - t0) / 86_400;
    const stepDays = days > 20 ? 7 : days > 8 ? 3 : days > 3 ? 1 : 0;
    const xTicks: number[] = [];
    if (stepDays) {
      const d = new Date(t0 * 1000);
      d.setHours(0, 0, 0, 0);
      for (let t = d.getTime() / 1000 + 86_400; t < t1; t += stepDays * 86_400) xTicks.push(t);
    } else {
      xTicks.push(t0, (t0 + t1) / 2);
    }
    return { x, y, yTicks, segments, line, area, xTicks, iw, ih, stepDays };
  }, [points, width, unitStep]);

  if (!geo) return <div className="chart-empty">Collecting history...</div>;
  const last = points[points.length - 1];
  const cur = active === null ? undefined : points[active];
  const handoffs = geo.segments.slice(1).map((s) => s[0]);

  const nearest = (clientX: number) => {
    const box = wrap!.getBoundingClientRect();
    const px = clientX - box.left;
    let best = 0;
    points.forEach((p, i) => {
      if (Math.abs(geo.x(p.time) - px) < Math.abs(geo.x(points[best].time) - px)) best = i;
    });
    return best;
  };
  const onMove = (e: PointerEvent) => setActive(nearest(e.clientX));
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "ArrowLeft") setActive((a) => Math.max(0, (a ?? points.length) - 1));
    else if (e.key === "ArrowRight") setActive((a) => Math.min(points.length - 1, (a ?? -1) + 1));
    else return;
    e.preventDefault();
  };

  const tipLeft = cur ? Math.min(Math.max(geo.x(cur.time), 90), width - 90) : 0;

  return (
    <div className="chart" ref={setWrap}>
      <svg
        width={width}
        height={H}
        role="img"
        aria-label={`${label} over time, now ${format(last.value)}`}
        tabIndex={0}
        onPointerMove={onMove}
        onPointerLeave={() => setActive(null)}
        onFocus={() => setActive(points.length - 1)}
        onBlur={() => setActive(null)}
        onKeyDown={onKey}
      >
        {geo.yTicks.map((t) => (
          <g key={t}>
            <line className="chart-grid" x1={PAD.left} x2={width - PAD.right} y1={geo.y(t)} y2={geo.y(t)} />
            <text className="chart-axis" x={PAD.left - 8} y={geo.y(t)} dy="0.32em" textAnchor="end">
              {axisFormat(t)}
            </text>
          </g>
        ))}
        {geo.xTicks.map((t) => (
          <text key={t} className="chart-axis" x={geo.x(t)} y={H - 6} textAnchor="middle">
            {dayFmt.format(new Date(t * 1000))}
          </text>
        ))}
        {handoffs.map((p) => (
          <g key={p.time}>
            <line className="chart-handoff" x1={geo.x(p.time)} x2={geo.x(p.time)} y1={PAD.top - 6} y2={H - PAD.bottom} />
            <text className="chart-axis" x={geo.x(p.time) - 6} y={PAD.top - 8} textAnchor="end">
              {segmentLabels[p.segment]} from here
            </text>
          </g>
        ))}
        {geo.segments.map((ps) => (
          <g key={ps[0].segment}>
            <path className="chart-area" d={geo.area(ps)} />
            <path className="chart-line" d={geo.line(ps)} />
          </g>
        ))}
        <circle className="chart-dot" cx={geo.x(last.time)} cy={geo.y(last.value)} r={4} />
        <text className="chart-end" x={geo.x(last.time) + 10} y={geo.y(last.value)} dy="0.32em">
          {format(last.value)}
        </text>
        {cur && (
          <>
            <line className="chart-cross" x1={geo.x(cur.time)} x2={geo.x(cur.time)} y1={PAD.top} y2={H - PAD.bottom} />
            <circle className="chart-dot" cx={geo.x(cur.time)} cy={geo.y(cur.value)} r={4} />
          </>
        )}
      </svg>
      {cur && (
        <div className="chart-tip" style={{ left: tipLeft }}>
          <strong>{format(cur.value)}</strong>
          <span>{label}</span>
          <span className="muted">
            {fullFmt.format(new Date(cur.time * 1000))} · {segmentLabels[cur.segment]}
          </span>
        </div>
      )}
    </div>
  );
}
