import { useState } from "react";
import { useAccount, useReadContract, useWriteContract } from "wagmi";
import { addresses } from "../config";
import { assetsToShares, sharesToAssets, useProtocol, vault } from "../hooks/useProtocol";
import { useAccountState } from "../hooks/useAccountState";
import { useTx } from "../tx";
import { AmountInput, Card, Kicker, Notice, Row, Segmented, Stat } from "../components/ui";
import { ONE } from "../lib/math";
import { fmtBps, fmtMusd, parseAmount, toInput } from "../lib/format";
import { VaultHistory } from "./VaultHistory";

type Mode = "deposit" | "withdraw";

/** Every request from the queue head on, oldest first, in one call. */
function useRequests(queueHead: bigint, requestCount: bigint) {
  const count = requestCount > queueHead ? requestCount - queueHead : 0n;
  const q = useReadContract({
    ...vault,
    functionName: "getRequests",
    args: [queueHead, count],
    query: { enabled: count > 0n, refetchInterval: 10_000 },
  });
  return (q.data ?? []).map((r, i) => ({ id: queueHead + BigInt(i), ...r }));
}

const ordinal = (n: number) => {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`;
};

export function Lend() {
  const { address } = useAccount();
  const { data: protocol } = useProtocol();
  const { data: account } = useAccountState();
  const [mode, setMode] = useState<Mode>("deposit");
  const requests = useRequests(protocol?.queueHead ?? 0n, protocol?.requestCount ?? 0n);

  if (!protocol) return <div className="loading">Loading the vault...</div>;
  const { totalAssets, totalSupply } = protocol;
  const shares = account?.shares ?? 0n;
  const position = sharesToAssets(shares, totalAssets, totalSupply);
  const sharePrice = sharesToAssets(ONE, totalAssets, totalSupply);
  const queuedShares = requests
    .filter((r) => r.shares > 0n && address && r.owner.toLowerCase() === address.toLowerCase())
    .reduce((sum, r) => sum + r.shares, 0n);

  return (
    <div className="page">
      <section className="intro">
        <Kicker index="02" label="Lend" />
        <h1>
          Lend MUSD to bitcoin <em>borrowers.</em>
        </h1>
        <p>
          The vault funds every micro loan. Lenders earn the interest and issuance fees borrowers pay, and every loan is
          backed by at least 110% in BTC. Withdraw instantly from idle MUSD, or join a first-in, first-out queue that is
          paid as loans are repaid.
        </p>
      </section>

      {account && account.claimable > 0n && <ClaimCard amount={account.claimable} />}

      <div className="specs">
        <div className="spec">
          <span className="spec-k">Current yield</span>
          <span className="spec-v tone-good">{fmtBps(protocol.currentApyBps)}</span>
          <span className="spec-s">Interest on open loans over vault assets</span>
        </div>
        <div className="spec">
          <span className="spec-k">Total supplied</span>
          <span className="spec-v">{fmtMusd(totalAssets, 0)}<small>MUSD</small></span>
          <span className="spec-s">1 mtMUSD = {fmtMusd(sharePrice, 6)} MUSD</span>
        </div>
        <div className="spec">
          <span className="spec-k">Lent to borrowers</span>
          <span className="spec-v">{fmtMusd(protocol.lenderAssets, 0)}<small>MUSD</small></span>
          <span className="spec-s">{protocol.borrowerCount.toString()} open troves</span>
        </div>
        <div className="spec">
          <span className="spec-k">Available</span>
          <span className="spec-v">{fmtMusd(protocol.lendableLiquidity, 0)}<small>MUSD</small></span>
          <span className="spec-s">
            {protocol.pendingAssets > 0n ? `${fmtMusd(protocol.pendingAssets)} reserved for the queue` : "Nothing queued"}
          </span>
        </div>
        <div className="specs-foot util">
          <div className="util-head">
            <span className="stat-label">Utilization</span>
            <strong>{fmtBps(protocol.utilizationBps, 1)}</strong>
            <span className="badge">mtMUSD · ERC-4626</span>
          </div>
          <div className="util-track">
            <div className="util-fill" style={{ width: `${Number(protocol.utilizationBps) / 100}%` }} />
          </div>
        </div>
      </div>

      <div className="grid-2">
        <Card index="2.1" title="Your deposit">
          <div className="stats stats-2">
            <Stat
              label="Value"
              value={`${fmtMusd(position, 4)} MUSD`}
              sub={
                queuedShares > 0n
                  ? `plus ${fmtMusd(sharesToAssets(queuedShares, totalAssets, totalSupply))} MUSD queued`
                  : `${fmtMusd(shares, 4)} mtMUSD`
              }
            />
            <Stat label="Withdraw instantly" value={`${fmtMusd(account?.maxWithdraw ?? 0n)} MUSD`} sub="Idle MUSD the queue does not need" />
          </div>
          <Segmented<Mode>
            value={mode}
            onChange={setMode}
            options={[
              { value: "deposit", label: "Deposit" },
              { value: "withdraw", label: "Withdraw", disabled: shares === 0n },
            ]}
          />
          <div className="form">
            {mode === "deposit" ? (
              <DepositForm totalAssets={totalAssets} totalSupply={totalSupply} />
            ) : (
              <WithdrawForm position={position} shares={shares} maxWithdraw={account?.maxWithdraw ?? 0n} totalAssets={totalAssets} totalSupply={totalSupply} />
            )}
          </div>
        </Card>
        <Queue
          requests={requests}
          queueHead={protocol.queueHead}
          pendingShares={protocol.pendingShares}
          idle={protocol.idleAssets}
          totalAssets={totalAssets}
          totalSupply={totalSupply}
        />
      </div>

      <VaultHistory />
    </div>
  );
}

function ClaimCard({ amount }: { amount: bigint }) {
  const { address } = useAccount();
  const { run, busy } = useTx();
  const { writeContractAsync } = useWriteContract();
  return (
    <Card className="card-accent">
      <div className="surplus">
        <div>
          <h2>MUSD waiting for you</h2>
          <p>
            A queued withdrawal of yours was filled, but its receiver could not accept MUSD. The vault kept{" "}
            <strong>{fmtMusd(amount)} MUSD</strong> for you instead of holding up the queue.
          </p>
        </div>
        <button
          className="btn btn-primary"
          disabled={busy || !address}
          onClick={() => run("Claim MUSD", () => writeContractAsync({ ...vault, functionName: "claim", args: [address!] }))}
        >
          Claim {fmtMusd(amount)} MUSD
        </button>
      </div>
    </Card>
  );
}

function DepositForm({ totalAssets, totalSupply }: { totalAssets: bigint; totalSupply: bigint }) {
  const { address, isConnected } = useAccount();
  const { data: account } = useAccountState();
  const { run, ensureAllowance, busy } = useTx();
  const { writeContractAsync } = useWriteContract();
  const [input, setInput] = useState("");
  const amount = parseAmount(input) ?? 0n;
  const musd = account?.musd ?? 0n;

  let error: string | undefined;
  if (!isConnected) error = "Connect a wallet";
  else if (amount === 0n) error = "Enter an amount";
  else if (amount > musd) error = "Not enough MUSD in your wallet";

  const submit = async () => {
    if (!address) return;
    if (!(await ensureAllowance(addresses.musd, addresses.vault, amount, "Approve MUSD"))) return;
    const ok = await run(`Deposit ${fmtMusd(amount)} MUSD`, () =>
      writeContractAsync({ ...vault, functionName: "deposit", args: [amount, address] }),
    );
    if (ok) setInput("");
  };

  return (
    <>
      <AmountInput label="Deposit" unit="MUSD" value={input} onChange={setInput} hint={`Wallet: ${fmtMusd(musd)} MUSD`} onMax={() => setInput(toInput(musd, 6))} />
      <Row label="You receive" value={`${fmtMusd(assetsToShares(amount, totalAssets, totalSupply), 4)} mtMUSD`} />
      {isConnected && musd === 0n && (
        <Notice>You need MUSD to lend. Borrow some against BTC in Mezo's app or with a micro trove here.</Notice>
      )}
      <button className="btn btn-primary btn-lg" disabled={!!error || busy} onClick={submit}>
        {error ?? `Deposit ${fmtMusd(amount)} MUSD`}
      </button>
    </>
  );
}

function WithdrawForm({ position, shares, maxWithdraw, totalAssets, totalSupply }: {
  position: bigint;
  shares: bigint;
  maxWithdraw: bigint;
  totalAssets: bigint;
  totalSupply: bigint;
}) {
  const { address } = useAccount();
  const { run, busy } = useTx();
  const { writeContractAsync } = useWriteContract();
  const [input, setInput] = useState("");
  const [all, setAll] = useState(false);
  const amount = all ? position : parseAmount(input) ?? 0n;
  const instant = amount <= maxWithdraw;
  // Shares for `amount`, rounded up like previewWithdraw and capped at the balance.
  const sharesFor = all
    ? shares
    : (() => {
        const s = (amount * (totalSupply + 1n) + totalAssets) / (totalAssets + 1n);
        return s > shares ? shares : s;
      })();

  let error: string | undefined;
  if (amount === 0n) error = "Enter an amount";
  else if (amount > position) error = "More than your deposit";

  const submit = async () => {
    if (!address) return;
    // A full exit redeems every share so no dust is left behind.
    const ok = instant
      ? await run(`Withdraw ${fmtMusd(amount)} MUSD`, () =>
          all
            ? writeContractAsync({ ...vault, functionName: "redeem", args: [shares, address, address] })
            : writeContractAsync({ ...vault, functionName: "withdraw", args: [amount, address, address] }),
        )
      : await run(`Queue ${fmtMusd(amount)} MUSD`, () =>
          writeContractAsync({ ...vault, functionName: "requestRedeem", args: [sharesFor, address] }),
        );
    if (ok) {
      setInput("");
      setAll(false);
    }
  };

  return (
    <>
      <AmountInput
        label="Withdraw"
        unit="MUSD"
        value={all ? toInput(position, 6) : input}
        onChange={(v) => {
          setAll(false);
          setInput(v);
        }}
        hint={`Deposit: ${fmtMusd(position)} MUSD`}
        onMax={() => setAll(true)}
      />
      <Row label="Shares burned" value={`${fmtMusd(sharesFor, 4)} mtMUSD`} />
      {!instant && amount > 0n && (
        <Notice>
          Only {fmtMusd(maxWithdraw)} MUSD can be withdrawn right now. Queued shares keep earning and are paid in order
          as borrowers repay. You can cancel any time before it is filled.
        </Notice>
      )}
      <button className="btn btn-primary btn-lg" disabled={!!error || busy} onClick={submit}>
        {error ?? (instant ? `Withdraw ${fmtMusd(amount)} MUSD` : `Queue ${fmtMusd(amount)} MUSD`)}
      </button>
    </>
  );
}

function Queue({ requests, queueHead, pendingShares, idle, totalAssets, totalSupply }: {
  requests: ReturnType<typeof useRequests>;
  queueHead: bigint;
  pendingShares: bigint;
  idle: bigint;
  totalAssets: bigint;
  totalSupply: bigint;
}) {
  const { address } = useAccount();
  const { run, busy } = useTx();
  const { writeContractAsync } = useWriteContract();
  const active = requests.filter((r) => r.shares > 0n && r.id >= queueHead);
  const mine = active.filter((r) => address && r.owner.toLowerCase() === address.toLowerCase());
  const value = (shares: bigint) => sharesToAssets(shares, totalAssets, totalSupply);

  return (
    <Card index="2.2" title="Withdrawal queue" aside={<span className="badge">FIFO</span>}>
      <Row label="Queued" value={`${fmtMusd(value(pendingShares))} MUSD in ${active.length} request${active.length === 1 ? "" : "s"}`} />
      <Row label="Idle MUSD to pay it" value={`${fmtMusd(idle)} MUSD`} />
      {active.length > 0 && (
        <ol className="queue" aria-label="Queued requests, first in line at the top">
          {active.slice(0, 8).map((r, i) => {
            const own = address && r.owner.toLowerCase() === address.toLowerCase();
            return (
              <li key={r.id.toString()} className={own ? "is-mine" : ""}>
                <span className="queue-n">{i + 1}</span>
                <span className="mono">{own ? "You" : `${r.owner.slice(0, 6)}...${r.owner.slice(-4)}`}</span>
                <span className="num">{fmtMusd(value(r.shares))} MUSD</span>
              </li>
            );
          })}
          {active.length > 8 && <li className="muted">and {active.length - 8} more</li>}
        </ol>
      )}
      {mine.length > 0 && (
        <ul className="list">
          {mine.map((r) => {
            const place = active.findIndex((a) => a.id === r.id) + 1;
            const ahead = active.filter((a) => a.id < r.id).reduce((sum, a) => sum + value(a.shares), 0n);
            const needed = ahead + value(r.shares);
            const status =
              idle >= needed
                ? "Payable now: anyone can process the queue"
                : idle > ahead
                  ? `Partly payable now, the rest waits for ${fmtMusd(needed - idle)} MUSD of repayments`
                  : `Waits for ${fmtMusd(needed - idle)} MUSD of repayments`;
            return (
              <li key={r.id.toString()}>
                <div>
                  <strong>{ordinal(place)} in line</strong> · request #{r.id.toString()} · {fmtMusd(value(r.shares))} MUSD
                  <div className="muted">
                    {ahead === 0n ? "Nothing ahead of you" : `${fmtMusd(ahead)} MUSD ahead of you`}. {status}.
                  </div>
                </div>
                <button
                  className="btn btn-ghost btn-sm"
                  disabled={busy}
                  onClick={() => run(`Cancel request #${r.id}`, () => writeContractAsync({ ...vault, functionName: "cancelRedeemRequest", args: [r.id] }))}
                >
                  Cancel
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <p className="fine">
        Anyone can pay the queue once borrowers repay. Every loan matures within one term, so a request waits at most
        that long.
      </p>
      <button
        className="btn btn-secondary"
        disabled={busy || !address || pendingShares === 0n || idle === 0n}
        onClick={() => run("Process queue", () => writeContractAsync({ ...vault, functionName: "processQueue", args: [20n] }))}
      >
        Pay queued withdrawals
      </button>
    </Card>
  );
}
