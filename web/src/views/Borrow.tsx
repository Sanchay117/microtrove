import { useState } from "react";
import { useAccount, useWriteContract } from "wagmi";
import { loans, usePrice, useProtocol, type Params } from "../hooks/useProtocol";
import { useAccountState } from "../hooks/useAccountState";
import { useTx } from "../tx";
import { AmountInput, Card, HealthBar, Kicker, Notice, RatioFigure, Row, healthTone } from "../components/ui";
import {
  ONE,
  collateralFor,
  collateralValue,
  feeFor,
  icr,
  interestFor,
  liquidationPrice,
  maxBig,
  minBig,
} from "../lib/math";
import { fmtBps, fmtBtc, fmtDate, fmtMusd, fmtPrice, fmtRatio, fmtUsd, parseAmount, toInput } from "../lib/format";
import { FAUCET } from "../config";
import { GAS_RESERVE, maxBorrowFor } from "../lib/loan";
import { Position } from "./Position";

export function Borrow() {
  const { price } = usePrice();
  const { data: protocol } = useProtocol();
  const { data: account } = useAccountState();

  if (!protocol || price === undefined) return <div className="loading">Loading the loan book...</div>;
  const { params } = protocol;

  const days = Number(params.term) / 86_400;

  return (
    <div className="page">
      <section className="intro">
        <Kicker index="01" label="Borrow" />
        <h1>
          Borrow MUSD against a little <em>bitcoin.</em>
        </h1>
        <p>
          MUSD troves start at 1,800 MUSD. Microtrove lends {fmtMusd(params.minDebt, 0)} to{" "}
          {fmtMusd(params.maxDebt, 0)} MUSD at a fixed rate, funded by lenders, so you can try a
          bitcoin-backed loan with $50 of BTC and grow into a full MUSD trove later.
        </p>
      </section>

      <div className="specs">
        <div className="spec">
          <span className="spec-k">Rate</span>
          <span className="spec-v">{fmtBps(params.interestRateBps)}</span>
          <span className="spec-s">APR, fixed for the term</span>
        </div>
        <div className="spec">
          <span className="spec-k">Issuance fee</span>
          <span className="spec-v">{fmtBps(params.issuanceFeeBps)}</span>
          <span className="spec-s">Added to the debt</span>
        </div>
        <div className="spec">
          <span className="spec-k">Term</span>
          <span className="spec-v">{days >= 1 ? `${Math.round(days)}d` : `${Math.round(Number(params.term) / 60)}m`}</span>
          <span className="spec-s">Repay any time</span>
        </div>
        <div className="spec">
          <span className="spec-k">Minimum collateral</span>
          <span className="spec-v">{fmtRatio(params.mcr, 0)}</span>
          <span className="spec-s">Up to {fmtRatio(params.maxCr, 0)}</span>
        </div>
      </div>

      {account && account.surplus > 0n && <SurplusCard amount={account.surplus} price={price} />}

      {account?.trove.active ? (
        <Position trove={account.trove} params={params} price={price} />
      ) : (
        <OpenForm params={params} price={price} lendable={protocol.lendableLiquidity} paused={protocol.paused} />
      )}
    </div>
  );
}

function SurplusCard({ amount, price }: { amount: bigint; price: bigint }) {
  const { run, busy } = useTx();
  const { writeContractAsync } = useWriteContract();
  return (
    <Card className="card-accent">
      <div className="surplus">
        <div>
          <h2>BTC waiting for you</h2>
          <p>
            A keeper repaid your matured loan. The collateral left after their premium,{" "}
            <strong>{fmtBtc(amount)} BTC</strong> ({fmtUsd(collateralValue(amount, price))}), is yours to claim.
          </p>
        </div>
        <button
          className="btn btn-primary"
          disabled={busy}
          onClick={() => run("Claim BTC", () => writeContractAsync({ ...loans, functionName: "claimSurplus" }))}
        >
          Claim {fmtBtc(amount)} BTC
        </button>
      </div>
    </Card>
  );
}

const RATIO_PRESETS = [150n, 200n, 300n];

function OpenForm({ params, price, lendable, paused }: {
  params: Params;
  price: bigint;
  lendable: bigint;
  paused: boolean;
}) {
  const { isConnected } = useAccount();
  const { data: account } = useAccountState();
  const { run, busy } = useTx();
  const { writeContractAsync } = useWriteContract();
  const [borrowIn, setBorrowIn] = useState("100");
  const [collIn, setCollIn] = useState("");
  const [ratioPick, setRatioPick] = useState<bigint | null>(200n);

  const borrow = parseAmount(borrowIn) ?? 0n;
  const fee = feeFor(borrow, params.issuanceFeeBps);
  const debt = borrow + fee;

  // Until the user types a BTC amount, collateral follows the chosen ratio.
  const suggested = ratioPick
    ? collateralFor(maxBig(debt, params.minDebt), (ratioPick * ONE) / 100n, price)
    : 0n;
  const coll = ratioPick ? suggested : parseAmount(collIn) ?? 0n;
  const collDisplay = ratioPick ? (suggested > 0n ? toInput(suggested, 8) : "") : collIn;

  const value = collateralValue(coll, price);
  const ratio = icr(coll, debt, price);
  const liqPrice = liquidationPrice(coll, debt, params.mcr);
  const interest = interestFor(debt, params.interestRateBps, params.term);
  const maturity = Math.floor(Date.now() / 1000) + Number(params.term);
  const maxBorrow = minBig(maxBorrowFor(params), lendable);
  const btc = account?.btc ?? 0n;

  let error: string | undefined;
  if (coll === 0n) error = "Enter the BTC to lock";
  else if (isConnected && coll + GAS_RESERVE > btc) error = "Not enough BTC in your wallet";
  else if (borrow > 0n && paused) error = "New borrowing is paused";
  else if (borrow > 0n && debt < params.minDebt) error = `Borrow at least ${fmtMusd(params.minDebt)} MUSD including the fee`;
  else if (debt > params.maxDebt) error = `Debt including the fee is capped at ${fmtMusd(params.maxDebt)} MUSD`;
  else if (borrow > lendable) error = `Lenders have ${fmtMusd(lendable)} MUSD available right now`;
  else if (value * ONE < params.mcr * params.minDebt)
    error = `Lock at least ${fmtUsd((params.mcr * params.minDebt) / ONE)} of BTC`;
  else if (ratio !== undefined && ratio < params.mcr) error = `Collateral ratio must be at least ${fmtRatio(params.mcr, 0)}`;
  else if (value * ONE > params.maxCr * maxBig(debt, params.minDebt))
    error = `Collateral is capped at ${fmtRatio(params.maxCr, 0)} of the debt. Borrow more or lock less BTC`;

  const submit = async () => {
    const ok = await run(borrow > 0n ? `Borrow ${fmtMusd(borrow)} MUSD` : "Open micro trove", () =>
      writeContractAsync({ ...loans, functionName: "open", args: [borrow], value: coll }),
    );
    if (ok) setBorrowIn("100");
  };

  return (
    <div className="grid-2">
      <Card index="1.1" title="Open a micro trove">
        <div className="form">
          <AmountInput
            label="Borrow"
            unit="MUSD"
            value={borrowIn}
            onChange={setBorrowIn}
            hint={`${fmtMusd(params.minDebt, 0)} to ${fmtMusd(params.maxDebt, 0)} MUSD`}
            onMax={() => setBorrowIn(toInput(maxBorrow, 2))}
          />
          <AmountInput
            label="Lock as collateral"
            unit="BTC"
            value={collDisplay}
            onChange={(v) => {
              setRatioPick(null);
              setCollIn(v);
            }}
            hint={isConnected ? `Wallet: ${fmtBtc(btc)} BTC` : undefined}
            onMax={isConnected ? () => { setRatioPick(null); setCollIn(toInput(btc > GAS_RESERVE ? btc - GAS_RESERVE : 0n, 8)); } : undefined}
          />
          <div className="presets">
            <span>Collateral ratio</span>
            {RATIO_PRESETS.map((r) => (
              <button
                key={r.toString()}
                type="button"
                className={`chip ${ratioPick === r ? "chip-on" : ""}`}
                onClick={() => setRatioPick(r)}
              >
                {r.toString()}%
              </button>
            ))}
          </div>
          {!isConnected ? (
            <Notice>Connect a wallet on Mezo Testnet to open a trove.</Notice>
          ) : btc === 0n ? (
            <Notice tone="warn">
              Your wallet has no testnet BTC. <a href={FAUCET} target="_blank" rel="noreferrer">Get some from the Mezo faucet</a>.
            </Notice>
          ) : null}
          <button className="btn btn-primary btn-lg" disabled={!isConnected || !!error || busy} onClick={submit}>
            {error && isConnected ? error : borrow > 0n ? `Lock BTC and borrow ${fmtMusd(borrow)} MUSD` : "Open without borrowing"}
          </button>
        </div>
      </Card>

      <Card index="1.2" title="Your loan">
        <div className="summary">
          <div className="summary-ratio">
            <div className="stat-label">Collateral ratio</div>
            <RatioFigure ratio={ratio} className={`tone-${healthTone(ratio, params.mcr)}`} />
            <HealthBar ratio={ratio} mcr={params.mcr} maxCr={params.maxCr} />
          </div>
          <Row label="Collateral value" value={fmtUsd(value)} />
          <Row label="You receive" value={`${fmtMusd(borrow)} MUSD`} />
          <Row label={`Issuance fee (${fmtBps(params.issuanceFeeBps)})`} value={`${fmtMusd(fee)} MUSD`} />
          <Row label="Debt" value={`${fmtMusd(debt)} MUSD`} />
          <Row label="Interest if held to maturity" value={`${fmtMusd(interest)} MUSD`} />
          <Row label="Due by" value={debt > 0n ? fmtDate(maturity) : "-"} />
          <Row
            label="Liquidated if BTC falls below"
            value={liqPrice ? fmtPrice(liqPrice) : "-"}
            tone={liqPrice && liqPrice * 100n > price * 85n ? "warn" : undefined}
          />
          <p className="fine">
            Repay any time with no penalty. If the loan is still open at maturity, a keeper can
            repay it and take BTC worth the debt plus {fmtBps(params.expiryBonusBps)}; the rest
            of your BTC stays claimable.
          </p>
        </div>
      </Card>
    </div>
  );
}
