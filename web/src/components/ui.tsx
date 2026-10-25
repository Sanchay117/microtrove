import type { ReactNode } from "react";
import { ONE } from "../lib/math";
import { fmtRatio } from "../lib/format";

export function Card({ index, title, aside, children, className = "" }: {
  index?: string;
  title?: ReactNode;
  aside?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`card ${className}`}>
      {(title || aside) && (
        <header className="card-head">
          {index && <span className="card-n">{index}</span>}
          {title && <h2>{title}</h2>}
          {aside}
        </header>
      )}
      {children}
    </section>
  );
}

export function Kicker({ index, label }: { index: string; label: string }) {
  return (
    <div className="kicker">
      <b>{index}</b>
      <span>{label}</span>
      <span>Mezo Testnet</span>
    </div>
  );
}

export function Stat({ label, value, sub, tone }: {
  label: ReactNode;
  value: ReactNode;
  sub?: ReactNode;
  tone?: "good" | "warn" | "bad";
}) {
  return (
    <div className="stat">
      <div className="stat-label">{label}</div>
      <div className={`stat-value ${tone ? `tone-${tone}` : ""}`}>{value}</div>
      {sub && <div className="stat-sub">{sub}</div>}
    </div>
  );
}

export function Row({ label, value, tone }: { label: ReactNode; value: ReactNode; tone?: "good" | "warn" | "bad" }) {
  return (
    <div className="row">
      <span>{label}</span>
      <span className={tone ? `tone-${tone}` : ""}>{value}</span>
    </div>
  );
}

export function AmountInput({ label, value, onChange, unit, hint, onMax, error, placeholder = "0.00" }: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  unit: string;
  hint?: ReactNode;
  onMax?: () => void;
  error?: string;
  placeholder?: string;
}) {
  return (
    <label className={`field ${error ? "field-error" : ""}`}>
      <span className="field-top">
        <span className="field-label">{label}</span>
        {hint && <span className="field-hint">{hint}</span>}
      </span>
      <span className="field-box">
        <input
          inputMode="decimal"
          autoComplete="off"
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value.replace(",", "."))}
        />
        {onMax && (
          <button type="button" className="chip" onClick={onMax}>
            Max
          </button>
        )}
        <span className="field-unit">{unit}</span>
      </span>
      {error && <span className="field-msg">{error}</span>}
    </label>
  );
}

export function Notice({ tone = "info", children }: { tone?: "info" | "warn" | "bad" | "good"; children: ReactNode }) {
  return <div className={`notice notice-${tone}`}>{children}</div>;
}

export const healthTone = (ratio: bigint | undefined, mcr: bigint) => {
  if (ratio === undefined) return "good" as const;
  if (ratio < mcr) return "bad" as const;
  if (ratio < (mcr * 3n) / 2n) return "warn" as const;
  return "good" as const;
};

/** Big ratio figure with the percent sign set small. */
export function RatioFigure({ ratio, empty = "-", className = "" }: { ratio: bigint | undefined; empty?: string; className?: string }) {
  if (ratio === undefined) return <div className={`figure ${className}`}>{empty}</div>;
  const pct = (Number(ratio) / Number(ONE)) * 100;
  return (
    <div className={`figure ${className}`}>
      {pct >= 1000 ? Math.round(pct).toLocaleString("en-US") : pct.toFixed(1)}
      <small>%</small>
    </div>
  );
}

const RULER_TICKS = [150, 200, 300];

/** Collateral ratio on a log scale from 100% to the cap, with the liquidation zone hatched. */
export function HealthBar({ ratio, mcr, maxCr }: { ratio: bigint | undefined; mcr: bigint; maxCr: bigint }) {
  const top = Math.log(Number(maxCr) / Number(ONE));
  const pos = (pct: number) => Math.max(0, Math.min(100, (Math.log(pct / 100) / top) * 100));
  const posOf = (r: bigint) => pos((Number(r) / Number(ONE)) * 100);
  const minPct = (Number(mcr) / Number(ONE)) * 100;
  const maxPct = (Number(maxCr) / Number(ONE)) * 100;
  const bad = ratio !== undefined && ratio < mcr;
  return (
    <div className="ruler" aria-label={ratio === undefined ? "No debt" : `Collateral ratio ${fmtRatio(ratio)}`}>
      <div className="ruler-track">
        <div className="ruler-danger" style={{ width: `${pos(minPct)}%` }} />
        <span className="ruler-tick ruler-tick-major" style={{ left: `${pos(minPct)}%` }} />
        {RULER_TICKS.filter((t) => t < maxPct).map((t) => (
          <span key={t} className="ruler-tick" style={{ left: `${pos(t)}%` }} />
        ))}
        {ratio !== undefined && (
          <>
            <div className="ruler-fill" style={{ width: `${posOf(ratio)}%` }} />
            <span className={`ruler-marker ${bad ? "is-bad" : ""}`} style={{ left: `${posOf(ratio)}%` }} />
          </>
        )}
      </div>
      <div className="ruler-labels">
        <span className="is-min" style={{ left: `${pos(minPct)}%` }}>{minPct.toFixed(0)}</span>
        {RULER_TICKS.filter((t) => t < maxPct).map((t) => (
          <span key={t} style={{ left: `${pos(t)}%` }}>{t}</span>
        ))}
        <span style={{ left: "100%" }}>{maxPct.toFixed(0)}% cap</span>
      </div>
    </div>
  );
}

export function Segmented<T extends string>({ value, options, onChange }: {
  value: T;
  options: { value: T; label: string; disabled?: boolean }[];
  onChange: (value: T) => void;
}) {
  return (
    <div className="segmented" role="tablist">
      {options.map((o) => (
        <button
          key={o.value}
          role="tab"
          aria-selected={o.value === value}
          disabled={o.disabled}
          className={o.value === value ? "active" : ""}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
