import { useState, type ReactNode } from "react";
import type { Params } from "../hooks/useProtocol";
import { FAUCET } from "../config";
import { Card } from "../components/ui";
import { fmtBtc, fmtMusd, fmtRatio, fmtUsd } from "../lib/format";

const HIDDEN = "microtrove:guide-hidden";

// A remembered preference only; the guide shows again if storage is unavailable.
const readHidden = () => {
  try {
    return localStorage.getItem(HIDDEN) === "1";
  } catch {
    return false;
  }
};
const writeHidden = (hidden: boolean) => {
  try {
    if (hidden) localStorage.setItem(HIDDEN, "1");
    else localStorage.removeItem(HIDDEN);
  } catch {
    /* private window: nothing to remember */
  }
};

/** Opens the wallet picker in the header. */
export const openWalletMenu = () => window.dispatchEvent(new Event("microtrove:connect"));

const termText = (term: bigint) => {
  const days = Number(term) / 86_400;
  return days >= 1 ? `${Math.round(days)} days` : `${Math.round(Number(term) / 60)} minutes`;
};

type Step = { title: string; done: boolean; body: ReactNode; action?: ReactNode };

/**
 * A walkthrough for someone who has never used MUSD. Each step checks itself off from live wallet and
 * form state, and the loan step explains the numbers the user has actually picked.
 */
export function FirstLoanGuide({
  params,
  connected,
  wrongChain,
  btc,
  borrow,
  coll,
  value,
  liqPrice,
  price,
  ready,
  problem,
}: {
  params: Params;
  connected: boolean;
  wrongChain: boolean;
  btc: bigint;
  borrow: bigint;
  coll: bigint;
  value: bigint;
  liqPrice: bigint | undefined;
  price: bigint;
  ready: boolean;
  /** Why the form cannot be submitted yet, shown on the loan step. */
  problem?: string;
}) {
  const [hidden, setHidden] = useState(readHidden);
  const toggle = (next: boolean) => {
    setHidden(next);
    writeHidden(next);
  };

  if (hidden) {
    return (
      <button type="button" className="guide-reopen" onClick={() => toggle(false)}>
        New to MUSD? Show the step-by-step guide
      </button>
    );
  }

  const drop = liqPrice && price > liqPrice ? Number(((price - liqPrice) * 1000n) / price) / 10 : undefined;
  const steps: Step[] = [
    {
      title: "Connect a wallet",
      done: connected && !wrongChain,
      body: wrongChain
        ? "Your wallet is on another network. Switch to Mezo Testnet with the button at the top."
        : "Any EVM wallet works: MetaMask, Rabby, OKX, Coinbase Wallet. The app adds Mezo Testnet for you.",
      action: !connected && (
        <button type="button" className="btn btn-ghost btn-sm" onClick={openWalletMenu}>
          Connect wallet
        </button>
      ),
    },
    {
      title: "Get testnet BTC",
      done: btc > 0n,
      body: (
        <>
          On Mezo, BTC is both the collateral and the gas. The faucet sends free testnet BTC, enough for several
          loans.{btc > 0n && <> You have {fmtBtc(btc)} BTC.</>}
        </>
      ),
      action: connected && btc === 0n && (
        <a className="btn btn-ghost btn-sm" href={FAUCET} target="_blank" rel="noreferrer">
          Open the Mezo faucet
        </a>
      ),
    },
    {
      title: "Pick a small loan",
      done: ready,
      body:
        borrow > 0n && coll > 0n ? (
          <>
            Borrowing {fmtMusd(borrow)} MUSD locks {fmtBtc(coll)} BTC ({fmtUsd(value)}).
            {drop !== undefined && <> BTC can fall {drop.toFixed(1)}% before the loan can be liquidated.</>} A higher
            ratio is safer.
            {problem && connected && <span className="guide-problem">{problem}.</span>}
          </>
        ) : (
          <>
            Start with 100 MUSD at 200%. You can borrow {fmtMusd(params.minDebt, 0)} to {fmtMusd(params.maxDebt, 0)}{" "}
            MUSD.
          </>
        ),
    },
    {
      title: "Confirm one transaction",
      done: false,
      body: `Your BTC is locked and the MUSD arrives in the same transaction. Repay within ${termText(
        params.term,
      )} with one signature and one transaction, and your BTC comes back.`,
    },
  ];
  const current = steps.findIndex((s) => !s.done);

  return (
    <Card
      index="1.0"
      title="Your first loan"
      className="guide"
      aside={
        <button type="button" className="link-btn" onClick={() => toggle(true)}>
          Hide guide
        </button>
      }
    >
      <ol className="guide-steps">
        {steps.map((s, i) => (
          <li key={s.title} className={s.done ? "is-done" : i === current ? "is-current" : undefined}>
            <span className="guide-n" aria-hidden>
              {s.done ? "✓" : i + 1}
            </span>
            <div>
              <strong>
                {s.title}
                {s.done && <span className="visually-hidden"> (done)</span>}
              </strong>
              <p>{s.body}</p>
              {i === current && s.action}
            </div>
          </li>
        ))}
      </ol>
      <details className="glossary">
        <summary>New to MUSD? Five words worth knowing</summary>
        <dl>
          <dt>MUSD</dt>
          <dd>Mezo's dollar stablecoin, minted against bitcoin. One MUSD aims to be worth one dollar.</dd>
          <dt>Trove</dt>
          <dd>
            A loan backed by BTC. Mezo's own troves start at 1,800 MUSD; a micro trove here starts at{" "}
            {fmtMusd(params.minDebt, 0)} MUSD, funded by lenders.
          </dd>
          <dt>Collateral ratio</dt>
          <dd>Your BTC's value divided by your debt. At 200%, $200 of BTC backs 100 MUSD.</dd>
          <dt>Liquidation</dt>
          <dd>
            If the ratio drops below {fmtRatio(params.mcr, 0)} or the loan passes its due date, anyone can repay it and
            take BTC for it. Whatever BTC is left stays yours to claim.
          </dd>
          <dt>Promotion</dt>
          <dd>
            Once you need 1,800 MUSD or more, move the loan into a full MUSD trove in one transaction. It has no due
            date.
          </dd>
        </dl>
      </details>
    </Card>
  );
}
