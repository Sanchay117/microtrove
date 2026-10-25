import { useState } from "react";
import { useWriteContract } from "wagmi";
import { addresses } from "../config";
import { loans, type Params } from "../hooks/useProtocol";
import { useAccountState, type Trove } from "../hooks/useAccountState";
import { useNow } from "../hooks/useNow";
import { useTx } from "../tx";
import { AmountInput, Card, HealthBar, Notice, RatioFigure, Row, Segmented, Stat, healthTone } from "../components/ui";
import { collateralFor, collateralValue, feeFor, icr, liquidationPrice, maxBig, minBig } from "../lib/math";
import { fmtBps, fmtBtc, fmtDate, fmtDuration, fmtMusd, fmtPrice, fmtRatio, fmtUsd, parseAmount, toInput } from "../lib/format";
import { GAS_RESERVE, debtWithBuffer, maxBorrowFor } from "../lib/loan";
import { Promote } from "./Promote";

type Action = "repay" | "borrow" | "add" | "withdraw" | "close";

export function Position({ trove, params, price }: { trove: Trove; params: Params; price: bigint }) {
  const now = useNow();
  const [action, setAction] = useState<Action>(trove.debt > 0n ? "repay" : "borrow");

  const ratio = icr(trove.collateral, trove.debt, price);
  const liqPrice = liquidationPrice(trove.collateral, trove.debt, params.mcr);
  const hasDebt = trove.principal > 0n;
  const matured = hasDebt && BigInt(now) >= trove.maturity;
  const underwater = ratio !== undefined && ratio < params.mcr;
  const remaining = hasDebt ? Number(trove.maturity) - now : 0;
  const termSeconds = Number(params.term);
  const elapsedPct = hasDebt ? Math.min(100, Math.max(0, ((termSeconds - remaining) / termSeconds) * 100)) : 0;

  return (
    <>
      {underwater && (
        <Notice tone="bad">
          Your collateral ratio is below {fmtRatio(params.mcr, 0)}. A keeper can repay your debt and take all of your
          BTC. Add BTC or repay now.
        </Notice>
      )}
      {matured && !underwater && (
        <Notice tone="warn">
          This loan has matured. Repay it now. Otherwise a keeper can repay it for you and take BTC worth the debt plus{" "}
          {fmtBps(params.expiryBonusBps)}; you can claim the rest afterwards.
        </Notice>
      )}

      <Card index="1.1" title="Your micro trove" aside={<span className="badge">{fmtBps(trove.interestRateBps || params.interestRateBps)} APR fixed</span>}>
        <div className="stats">
          <Stat label="Collateral" value={`${fmtBtc(trove.collateral)} BTC`} sub={fmtUsd(collateralValue(trove.collateral, price))} />
          <Stat
            label="Debt"
            value={`${fmtMusd(trove.debt, 4)} MUSD`}
            sub={hasDebt ? `${fmtMusd(trove.principal)} principal + ${fmtMusd(trove.interest, 4)} interest` : "No debt"}
          />
          <Stat
            label="Liquidation price"
            value={liqPrice ? fmtPrice(liqPrice) : "-"}
            sub={`BTC is ${fmtPrice(price)}`}
            tone={underwater ? "bad" : undefined}
          />
          <Stat
            label={matured ? "Matured" : "Due in"}
            value={hasDebt ? (matured ? "Repay now" : fmtDuration(remaining)) : "-"}
            sub={hasDebt ? fmtDate(trove.maturity) : "Borrowing starts a new term"}
            tone={matured ? "warn" : undefined}
          />
        </div>
        <div className="ratio-block">
          <div>
            <div className="stat-label">Collateral ratio</div>
            <RatioFigure
              ratio={hasDebt ? ratio : undefined}
              empty="No debt"
              className={`tone-${healthTone(ratio, params.mcr)}`}
            />
          </div>
          <div>
            <HealthBar ratio={hasDebt ? ratio : undefined} mcr={params.mcr} maxCr={params.maxCr} />
            {hasDebt && (
              <div className="term">
                <div className="term-track"><div className="term-fill" style={{ width: `${elapsedPct}%` }} /></div>
                <span>{Math.round(elapsedPct)}% of the term elapsed</span>
              </div>
            )}
          </div>
        </div>
      </Card>

      <div className="grid-2">
        <Card index="1.2" title="Manage">
          <Segmented<Action>
            value={action}
            onChange={setAction}
            options={[
              { value: "repay", label: "Repay", disabled: !hasDebt },
              { value: "borrow", label: "Borrow" },
              { value: "add", label: "Add BTC" },
              { value: "withdraw", label: "Withdraw" },
              { value: "close", label: "Close" },
            ]}
          />
          <div className="form">
            {action === "repay" && <RepayForm trove={trove} params={params} price={price} />}
            {action === "borrow" && <BorrowForm trove={trove} params={params} price={price} matured={matured} />}
            {action === "add" && <AddForm trove={trove} params={params} price={price} />}
            {action === "withdraw" && <WithdrawForm trove={trove} params={params} price={price} />}
            {action === "close" && <CloseForm trove={trove} />}
          </div>
        </Card>
        <Promote trove={trove} price={price} />
      </div>
    </>
  );
}

/** Warns when a change leaves less than a 25% cushion above the minimum ratio. */
function RiskNote({ ratio, mcr, price }: { ratio: bigint | undefined; mcr: bigint; price: bigint }) {
  if (ratio === undefined || ratio >= (mcr * 5n) / 4n) return null;
  const drop = Number(((ratio - mcr) * 10_000n) / ratio) / 100;
  return (
    <Notice tone="warn">
      A {drop.toFixed(1)}% drop in BTC (to {fmtPrice((price * mcr) / ratio)}) would make this trove liquidatable.
    </Notice>
  );
}

function Preview({ label, before, after }: { label: string; before: string; after: string }) {
  return <Row label={label} value={<>{before} <span className="arrow">→</span> {after}</>} />;
}

function RepayForm({ trove, params, price }: { trove: Trove; params: Params; price: bigint }) {
  const { data: account } = useAccountState();
  const { run, ensureAllowance, busy } = useTx();
  const { writeContractAsync } = useWriteContract();
  const [input, setInput] = useState("");
  const musd = account?.musd ?? 0n;
  const amount = parseAmount(input) ?? 0n;
  const full = amount >= trove.debt;
  const left = full ? 0n : trove.debt - amount;

  let error: string | undefined;
  if (amount === 0n) error = "Enter an amount";
  else if (amount > musd) error = "Not enough MUSD in your wallet";
  else if (!full && left < params.minDebt)
    error = `Leave at least ${fmtMusd(params.minDebt)} MUSD or repay everything`;

  const submit = async () => {
    if (!(await ensureAllowance(addresses.musd, addresses.loans, amount, "Approve MUSD"))) return;
    const ok = await run(`Repay ${fmtMusd(amount)} MUSD`, () =>
      writeContractAsync({ ...loans, functionName: "repay", args: [amount] }),
    );
    if (ok) setInput("");
  };

  return (
    <>
      <AmountInput
        label="Repay"
        unit="MUSD"
        value={input}
        onChange={setInput}
        hint={`Wallet: ${fmtMusd(musd)} MUSD`}
        onMax={() => setInput(toInput(minBig(musd, debtWithBuffer(trove)), 6))}
      />
      <Preview label="Debt" before={fmtMusd(trove.debt)} after={`${fmtMusd(left)} MUSD`} />
      <Preview
        label="Collateral ratio"
        before={fmtRatio(icr(trove.collateral, trove.debt, price))}
        after={left === 0n ? "No debt" : fmtRatio(icr(trove.collateral, left, price))}
      />
      <p className="fine">Interest is paid first. Repaying everything keeps the trove open with your BTC in it.</p>
      <button className="btn btn-primary btn-lg" disabled={!!error || busy} onClick={submit}>
        {error ?? `Repay ${fmtMusd(amount)} MUSD`}
      </button>
    </>
  );
}

function BorrowForm({ trove, params, price, matured }: { trove: Trove; params: Params; price: bigint; matured: boolean }) {
  const { run, busy } = useTx();
  const { writeContractAsync } = useWriteContract();
  const [input, setInput] = useState("");
  const amount = parseAmount(input) ?? 0n;
  const newTerm = trove.principal === 0n;
  const feeBps = newTerm ? params.issuanceFeeBps : trove.issuanceFeeBps;
  const fee = feeFor(amount, feeBps);
  const newDebt = trove.debt + amount + fee;
  const newRatio = icr(trove.collateral, newDebt, price);
  const maxAmount = maxBorrowFor({ ...params, issuanceFeeBps: feeBps }, trove.principal);

  let error: string | undefined;
  if (matured) error = "Matured loans must be repaid first";
  else if (amount === 0n) error = "Enter an amount";
  else if (trove.principal + amount + fee < params.minDebt) error = `Debt must reach at least ${fmtMusd(params.minDebt)} MUSD`;
  else if (trove.principal + amount + fee > params.maxDebt) error = `Debt is capped at ${fmtMusd(params.maxDebt)} MUSD`;
  else if (newRatio !== undefined && newRatio < params.mcr) error = `Ratio would drop below ${fmtRatio(params.mcr, 0)}`;

  const submit = async () => {
    const ok = await run(`Borrow ${fmtMusd(amount)} MUSD`, () =>
      writeContractAsync({ ...loans, functionName: "borrow", args: [amount] }),
    );
    if (ok) setInput("");
  };

  return (
    <>
      <AmountInput
        label="Borrow more"
        unit="MUSD"
        value={input}
        onChange={setInput}
        hint={`Up to ${fmtMusd(maxAmount)} MUSD`}
        onMax={() => setInput(toInput(maxAmount, 2))}
      />
      <Preview label="Debt" before={fmtMusd(trove.debt)} after={`${fmtMusd(newDebt)} MUSD`} />
      <Preview label="Collateral ratio" before={trove.debt ? fmtRatio(icr(trove.collateral, trove.debt, price)) : "No debt"} after={fmtRatio(newRatio)} />
      <Row label={`Issuance fee (${fmtBps(feeBps)})`} value={`${fmtMusd(fee)} MUSD`} />
      {!error && <RiskNote ratio={newRatio} mcr={params.mcr} price={price} />}
      <p className="fine">
        {newTerm
          ? `This starts a new ${Math.round(Number(params.term) / 86_400)}-day term at today's rate.`
          : `Borrowing more keeps the current due date, ${fmtDate(trove.maturity)}.`}
      </p>
      <button className="btn btn-primary btn-lg" disabled={!!error || busy} onClick={submit}>
        {error ?? `Borrow ${fmtMusd(amount)} MUSD`}
      </button>
    </>
  );
}

function AddForm({ trove, params, price }: { trove: Trove; params: Params; price: bigint }) {
  const { data: account } = useAccountState();
  const { run, busy } = useTx();
  const { writeContractAsync } = useWriteContract();
  const [input, setInput] = useState("");
  const amount = parseAmount(input) ?? 0n;
  const btc = account?.btc ?? 0n;
  const newColl = trove.collateral + amount;
  const cap = collateralFor(maxBig(trove.debt, params.minDebt), params.maxCr, price);
  const room = cap > trove.collateral ? cap - trove.collateral : 0n;

  let error: string | undefined;
  if (amount === 0n) error = "Enter an amount";
  else if (amount + GAS_RESERVE > btc) error = "Not enough BTC in your wallet";
  else if (newColl > cap) error = `Collateral is capped at ${fmtRatio(params.maxCr, 0)} of the debt`;

  const submit = async () => {
    const ok = await run(`Add ${fmtBtc(amount)} BTC`, () =>
      writeContractAsync({ ...loans, functionName: "addCollateral", value: amount }),
    );
    if (ok) setInput("");
  };

  return (
    <>
      <AmountInput
        label="Add collateral"
        unit="BTC"
        value={input}
        onChange={setInput}
        hint={`Wallet: ${fmtBtc(btc)} BTC`}
        onMax={() => setInput(toInput(minBig(room, btc > GAS_RESERVE ? btc - GAS_RESERVE : 0n), 8))}
      />
      <Preview label="Collateral" before={fmtBtc(trove.collateral)} after={`${fmtBtc(newColl)} BTC`} />
      {trove.debt > 0n && (
        <Preview label="Collateral ratio" before={fmtRatio(icr(trove.collateral, trove.debt, price))} after={fmtRatio(icr(newColl, trove.debt, price))} />
      )}
      <p className="fine">Topping up is always allowed, even below the minimum ratio.</p>
      <button className="btn btn-primary btn-lg" disabled={!!error || busy} onClick={submit}>
        {error ?? `Add ${fmtBtc(amount)} BTC`}
      </button>
    </>
  );
}

function WithdrawForm({ trove, params, price }: { trove: Trove; params: Params; price: bigint }) {
  const { run, busy } = useTx();
  const { writeContractAsync } = useWriteContract();
  const [input, setInput] = useState("");
  const amount = parseAmount(input) ?? 0n;
  const noDebt = trove.principal === 0n;
  // Keep MCR x max(debt, minDebt) worth of BTC unless withdrawing everything from a debt-free trove.
  // A 0.1% margin leaves room for interest and price moves before the transaction lands.
  const required = (collateralFor(maxBig(trove.debt, params.minDebt), params.mcr, price) * 1_001n) / 1_000n;
  const maxPartial = trove.collateral > required ? trove.collateral - required : 0n;
  const all = amount === trove.collateral;
  const newColl = trove.collateral - minBig(amount, trove.collateral);

  let error: string | undefined;
  if (amount === 0n) error = "Enter an amount";
  else if (amount > trove.collateral) error = "More than the trove holds";
  else if (all && !noDebt) error = "Repay the debt to withdraw everything";
  else if (!all && amount > maxPartial) error = `You can withdraw up to ${fmtBtc(maxPartial)} BTC`;

  const submit = async () => {
    const ok = await run(all ? "Withdraw all and close" : `Withdraw ${fmtBtc(amount)} BTC`, () =>
      writeContractAsync({ ...loans, functionName: "withdrawCollateral", args: [amount] }),
    );
    if (ok) setInput("");
  };

  return (
    <>
      <AmountInput
        label="Withdraw collateral"
        unit="BTC"
        value={input}
        onChange={setInput}
        hint={noDebt ? `Up to ${fmtBtc(trove.collateral)} BTC` : `Up to ${fmtBtc(maxPartial)} BTC`}
        onMax={() => setInput(toInput(noDebt ? trove.collateral : maxPartial, 8))}
      />
      <Preview label="Collateral" before={fmtBtc(trove.collateral)} after={`${fmtBtc(newColl)} BTC`} />
      {trove.debt > 0n && newColl > 0n && (
        <Preview label="Collateral ratio" before={fmtRatio(icr(trove.collateral, trove.debt, price))} after={fmtRatio(icr(newColl, trove.debt, price))} />
      )}
      {!error && trove.debt > 0n && <RiskNote ratio={icr(newColl, trove.debt, price)} mcr={params.mcr} price={price} />}
      {noDebt && <p className="fine">Withdrawing everything closes the trove.</p>}
      <button className="btn btn-primary btn-lg" disabled={!!error || busy} onClick={submit}>
        {error ?? (all ? "Withdraw all and close" : `Withdraw ${fmtBtc(amount)} BTC`)}
      </button>
    </>
  );
}

function CloseForm({ trove }: { trove: Trove }) {
  const { data: account } = useAccountState();
  const { run, ensureAllowance, busy } = useTx();
  const { writeContractAsync } = useWriteContract();
  const musd = account?.musd ?? 0n;
  const allowance = debtWithBuffer(trove);
  const error = trove.debt > musd ? `You need ${fmtMusd(trove.debt - musd)} more MUSD` : undefined;

  const submit = async () => {
    if (trove.debt > 0n && !(await ensureAllowance(addresses.musd, addresses.loans, allowance, "Approve MUSD"))) return;
    await run("Close micro trove", () => writeContractAsync({ ...loans, functionName: "close" }));
  };

  return (
    <>
      <Row label="You repay" value={`${fmtMusd(trove.debt, 4)} MUSD`} />
      <Row label="You get back" value={`${fmtBtc(trove.collateral)} BTC`} />
      <Row label="MUSD in wallet" value={fmtMusd(musd)} tone={error ? "bad" : undefined} />
      <p className="fine">Closing never reads the price oracle, so you can always exit.</p>
      <button className="btn btn-primary btn-lg" disabled={!!error || busy} onClick={submit}>
        {error ?? "Repay and close"}
      </button>
    </>
  );
}
