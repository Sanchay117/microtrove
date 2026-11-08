import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { CLAMP, f, pop, ramp } from "../anim";
import { Kicker } from "../components/Chrome";
import { Sfx } from "../components/Sfx";
import { Words } from "../components/Type";
import { FACTS, lineAt, short, wordAt } from "../data";
import { C, FPS, mono, sans } from "../theme";

const S = "terms";

const Arrow: React.FC<{ x: number; y: number; w: number; u: number; label?: string; color?: string }> = ({ x, y, w, u, label, color = C.ink }) => (
  <div style={{ position: "absolute", left: x, top: y, width: w, height: 40, opacity: u }}>
    <div style={{ position: "absolute", left: 0, top: 18, width: (w - 16) * u, height: 4, background: color }} />
    <div
      style={{
        position: "absolute",
        left: w - 18,
        top: 9,
        width: 0,
        height: 0,
        borderTop: "11px solid transparent",
        borderBottom: "11px solid transparent",
        borderLeft: `18px solid ${color}`,
        opacity: u >= 0.95 ? 1 : 0,
      }}
    />
    {label && <div style={{ position: "absolute", left: 0, top: -30, width: w, textAlign: "center", fontFamily: mono, fontSize: 22, color: C.ink2 }}>{label}</div>}
  </div>
);

const hms = (s: number) => {
  const t = Math.max(0, Math.floor(s));
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(Math.floor(t / 3600))}:${p(Math.floor((t % 3600) / 60))}:${p(t % 60)}`;
};

/** The Wave 1 review's High finding, and the 24-hour timelock that now owns both contracts. */
export const Terms: React.FC = () => {
  const frame = useCurrentFrame();
  const t = frame / FPS;
  const l1 = lineAt(S, 1);
  const a = (word: string) => wordAt(S, 0, word);
  const b = (word: string, nth = 0) => wordAt(S, 1, word, nth);

  // A: the owner could change the terms of every open loan at once.
  const outA = ramp(frame, l1.start - 0.35, 0.35);
  const flip = a("once");
  const flipped = frame >= f(flip);
  const hitA = pop(frame, flip, 9);

  // B: owner → timelock (24 hours) → loan book and vault, then the countdown the app shows.
  const inB = ramp(frame, l1.start - 0.15, 0.4);
  const tLock = b("time");
  const tBoth = b("both");
  const tEvery = b("every");
  const tWaits = b("waits");
  const tPublic = b("public");
  const tApp = b("app");
  const swapHead = ramp(frame, tEvery - 0.35, 0.3);
  const fill = interpolate(t, [tWaits, tPublic + 0.4], [0, 1], { ...CLAMP });
  const notice = ramp(frame, tApp - 0.3, 0.4);
  const left = 24 * 3600 - 19 - Math.max(0, t - (tApp - 0.3));

  return (
    <AbsoluteFill style={{ background: C.paper, fontFamily: sans }}>
      <AbsoluteFill style={{ opacity: 1 - outA, transform: `translateX(${-outA * 60}px)` }}>
        <Kicker index="07" label="Wave 1 review" style={{ position: "absolute", left: 160, top: 140, opacity: ramp(frame, 0.1, 0.4) }} />
        <Words
          words={[
            ["Terms", a("owner")],
            ["could", a("could") - 0.05],
            ["change", a("change")],
            ["at", a("at")],
            ["once.", a("once")],
          ]}
          size={96}
          color={C.ink}
          accent={{ 4: C.pink }}
          style={{ position: "absolute", left: 160, top: 196 }}
        />
        <div
          style={{
            position: "absolute",
            right: 160,
            top: 150,
            fontFamily: mono,
            fontSize: 22,
            color: C.pink,
            border: `2px solid ${C.pink}`,
            padding: "6px 14px",
            letterSpacing: 1,
            opacity: ramp(frame, a("review"), 0.3),
          }}
        >
          HIGH · REVIEW FINDING
        </div>

        <div
          style={{
            position: "absolute",
            left: 160,
            top: 470,
            width: 340,
            height: 200,
            border: `3px solid ${C.ink}`,
            background: C.panel,
            boxShadow: `8px 8px 0 ${C.ink}`,
            padding: "26px 30px",
            opacity: ramp(frame, a("owner") - 0.1, 0.35),
          }}
        >
          <div style={{ fontFamily: mono, fontSize: 22, color: C.ink2 }}>one key</div>
          <div style={{ fontSize: 56, fontWeight: 600, letterSpacing: -2, marginTop: 18 }}>Owner</div>
        </div>
        <Arrow x={530} y={550} w={300} u={ramp(frame, a("change") - 0.1, 0.4)} label="setParams" />
        <div
          style={{
            position: "absolute",
            left: 860,
            top: 420,
            width: 900,
            height: 300,
            border: `3px solid ${C.ink}`,
            background: C.panel,
            boxShadow: `8px 8px 0 ${flipped ? C.pink : C.ink}`,
            padding: "26px 34px",
            opacity: ramp(frame, a("loan") - 0.2, 0.35),
          }}
        >
          <div style={{ fontFamily: mono, fontSize: 22, color: C.ink2 }}>loan book · minimum collateral for every open loan</div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 36, marginTop: 26 }}>
            <div style={{ fontSize: 150, fontWeight: 600, letterSpacing: -7, lineHeight: 1, color: flipped ? C.ink3 : C.ink, textDecoration: flipped ? "line-through" : "none" }}>110%</div>
            <div
              style={{
                fontSize: 150,
                fontWeight: 600,
                letterSpacing: -7,
                lineHeight: 1,
                color: C.pink,
                opacity: Math.min(1, hitA),
                transform: `scale(${0.6 + 0.4 * Math.min(1.1, hitA)})`,
                transformOrigin: "left bottom",
              }}
            >
              150%
            </div>
          </div>
        </div>
        <div style={{ position: "absolute", left: 860, top: 760, fontFamily: mono, fontSize: 24, color: C.pink, opacity: ramp(frame, flip + 0.2, 0.3) }}>
          effective in the same block · no warning for borrowers
        </div>
      </AbsoluteFill>

      <AbsoluteFill style={{ opacity: inB }}>
        <Kicker index="07" label="Timelock" style={{ position: "absolute", left: 160, top: 140 }} />
        <div style={{ position: "absolute", left: 160, top: 196, opacity: 1 - swapHead }}>
          <Words
            words={[
              ["A", b("a")],
              ["timelock", tLock],
              ["owns", b("owns")],
              ["both.", tBoth],
            ]}
            size={96}
            color={C.ink}
            accent={{ 1: C.blue }}
          />
        </div>
        <Words
          words={[
            ["Every", tEvery],
            ["change", b("change")],
            ["waits", tWaits],
            ["24", b("twenty")],
            ["hours.", b("hours")],
          ]}
          size={96}
          color={C.ink}
          accent={{ 3: C.blue, 4: C.blue }}
          style={{ position: "absolute", left: 160, top: 196 }}
        />

        <div
          style={{
            position: "absolute",
            left: 160,
            top: 420,
            width: 300,
            height: 190,
            border: `3px solid ${C.ink}`,
            background: C.panel,
            padding: "24px 28px",
            opacity: ramp(frame, l1.start + 0.1, 0.35),
          }}
        >
          <div style={{ fontFamily: mono, fontSize: 22, color: C.ink2 }}>operator</div>
          <div style={{ fontSize: 48, fontWeight: 600, letterSpacing: -1.5, marginTop: 14 }}>Proposes</div>
          <div style={{ fontSize: 24, color: C.ink2, marginTop: 6 }}>or cancels</div>
        </div>
        <Arrow x={480} y={495} w={130} u={ramp(frame, tLock - 0.1, 0.35)} />
        <div
          style={{
            position: "absolute",
            left: 630,
            top: 390,
            width: 560,
            height: 250,
            background: C.ink,
            color: C.paper,
            boxShadow: `10px 10px 0 ${C.blue}`,
            padding: "24px 30px",
            opacity: ramp(frame, tLock - 0.1, 0.35),
            transform: `translateY(${(1 - ramp(frame, tLock - 0.1, 0.35)) * 20}px)`,
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", fontFamily: mono, fontSize: 22, color: C.onDark }}>
            <span>TimelockController</span>
            <span>{short(FACTS.timelock)}</span>
          </div>
          <div style={{ fontSize: 120, fontWeight: 600, letterSpacing: -5, lineHeight: 1, marginTop: 20, color: fill > 0 ? C.blueOnDark : C.paper }}>24h</div>
          <div style={{ marginTop: 22, height: 10, background: "#2a2a28" }}>
            <div style={{ width: `${fill * 100}%`, height: 10, background: C.blueOnDark }} />
          </div>
        </div>
        <Arrow x={1210} y={445} w={110} u={ramp(frame, tBoth - 0.2, 0.3)} />
        <Arrow x={1210} y={565} w={110} u={ramp(frame, tBoth - 0.1, 0.3)} />
        {[
          { name: "Loan book", top: 410, at: tBoth - 0.1 },
          { name: "Vault", top: 530, at: tBoth },
        ].map((x) => (
          <div
            key={x.name}
            style={{
              position: "absolute",
              left: 1340,
              top: x.top,
              width: 420,
              height: 100,
              border: `3px solid ${C.ink}`,
              background: C.panel,
              padding: "14px 24px",
              opacity: Math.min(1, pop(frame, x.at, 13)),
            }}
          >
            <div style={{ fontSize: 36, fontWeight: 600, letterSpacing: -1 }}>{x.name}</div>
            <div style={{ fontFamily: mono, fontSize: 20, color: C.ink2, marginTop: 4 }}>owner: timelock</div>
          </div>
        ))}

        {/* How the Borrow and Lend pages show a scheduled change (web/src/components/Governance.tsx). */}
        <div
          style={{
            position: "absolute",
            left: 160,
            top: 720,
            width: 1600,
            background: C.pinkSoft,
            borderLeft: `8px solid ${C.pink}`,
            padding: "22px 30px",
            display: "flex",
            alignItems: "center",
            gap: 30,
            opacity: notice,
            transform: `translateY(${(1 - notice) * 24}px)`,
          }}
        >
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 32, letterSpacing: -0.5 }}>
              <b>Scheduled change.</b> Change the minimum collateral from 110% to 150%.
            </div>
            <div style={{ fontSize: 24, color: C.ink2, marginTop: 6 }}>If your loan is below 150%, add BTC or repay before then.</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontFamily: mono, fontSize: 20, color: C.ink2 }}>can apply in</div>
            <div style={{ fontFamily: mono, fontSize: 44, fontWeight: 500, color: C.ink, fontVariantNumeric: "tabular-nums" }}>{hms(left)}</div>
          </div>
        </div>
        <div style={{ position: "absolute", left: 160, top: 880, fontFamily: mono, fontSize: 22, color: C.ink2, opacity: notice }}>
          example of the app’s notice · handover tx {short(FACTS.handoverTx)} · delay 86,400 s
        </div>
      </AbsoluteFill>

      <Sfx src="sfx/stamp.wav" at={flip} volume={0.4} />
      <Sfx src="sfx/swell.wav" at={tLock - 0.2} volume={0.25} />
      <Sfx src="sfx/draw.wav" at={tWaits} volume={0.3} />
      <Sfx src="sfx/pop.wav" at={tApp - 0.3} volume={0.35} />
    </AbsoluteFill>
  );
};
