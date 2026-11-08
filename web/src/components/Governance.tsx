import { decodeFunctionData, getAddress, parseAbi } from "viem";
import { microtrovesAbi } from "../abi/Microtroves";
import { vaultAbi } from "../abi/MicrotroveVault";
import { addressUrl, addresses } from "../config";
import { TIMELOCK, useGovernance, type PendingCall } from "../hooks/useGovernance";
import { useNow } from "../hooks/useNow";
import type { Params } from "../hooks/useProtocol";
import { fmtBps, fmtDate, fmtDuration, fmtMusd, fmtRatio, shortAddr } from "../lib/format";
import { Notice } from "./ui";

const timelockCalls = parseAbi([
  "function updateDelay(uint256 newDelay)",
  "function grantRole(bytes32 role, address account)",
  "function revokeRole(bytes32 role, address account)",
]);

const termText = (seconds: bigint) => {
  const s = Number(seconds);
  return s >= 86_400 ? `${Math.round(s / 86_400)} days` : `${Math.round(s / 3_600)} hours`;
};
const musd = (v: bigint) => `${fmtMusd(v, 0)} MUSD`;
const ratio = (v: bigint) => fmtRatio(v, 0);

const PARAMS: [keyof Params, string, (v: bigint) => string][] = [
  ["mcr", "minimum collateral", ratio],
  ["maxCr", "maximum collateral", ratio],
  ["interestRateBps", "rate", fmtBps],
  ["issuanceFeeBps", "issuance fee", fmtBps],
  ["term", "term", termText],
  ["minDebt", "smallest loan", musd],
  ["maxDebt", "largest loan", musd],
  ["protocolFeeBps", "protocol share of interest", fmtBps],
  ["expiryBonusBps", "keeper bonus on matured loans", fmtBps],
  ["underwaterBonusBps", "keeper bonus on underwater loans", fmtBps],
];

const delayText = (seconds: number) =>
  seconds % 86_400 === 0 && seconds >= 3 * 86_400 ? `${seconds / 86_400}-day` : `${Math.round(seconds / 3_600)}-hour`;

/** Plain-language description of one scheduled call, and the new minimum ratio if it sets one. */
export function describeCall(call: PendingCall, current: Params): { text: string; newMcr?: bigint } {
  try {
    if (call.target === getAddress(addresses.loans)) {
      const d = decodeFunctionData({ abi: microtrovesAbi, data: call.data });
      if (d.functionName === "setParams") {
        const next = d.args[0] as Record<keyof Params, bigint | number>;
        const changes = PARAMS.filter(([k]) => BigInt(next[k]) !== current[k]).map(
          ([k, label, fmt]) => `${label} from ${fmt(current[k])} to ${fmt(BigInt(next[k]))}`,
        );
        const newMcr = BigInt(next.mcr);
        return {
          text: changes.length ? `Change the ${changes.join(", the ")}` : "Set the same loan terms again",
          newMcr: newMcr > current.mcr ? newMcr : undefined,
        };
      }
      if (d.functionName === "pause") return { text: "Pause new borrowing (repaying, closing and liquidations keep working)" };
      if (d.functionName === "unpause") return { text: "Resume new borrowing" };
      if (d.functionName === "setFeeRecipient") return { text: `Send protocol fees to ${shortAddr(d.args[0] as string)}` };
      if (d.functionName === "transferOwnership") return { text: `Hand the loan book to ${shortAddr(d.args[0] as string)}` };
      return { text: `Call ${d.functionName} on the loan book` };
    }
    if (call.target === getAddress(addresses.vault)) {
      const d = decodeFunctionData({ abi: vaultAbi, data: call.data });
      if (d.functionName === "transferOwnership") return { text: `Hand the vault to ${shortAddr(d.args[0] as string)}` };
      return { text: `Call ${d.functionName} on the vault` };
    }
    if (call.target === TIMELOCK) {
      const d = decodeFunctionData({ abi: timelockCalls, data: call.data });
      if (d.functionName === "updateDelay") return { text: `Change the delay to ${fmtDuration(Number(d.args[0]))}` };
      return { text: "Change who can propose rule changes" };
    }
  } catch {
    // Falls through to the generic description.
  }
  return { text: `Call ${shortAddr(call.target)}` };
}

/**
 * Who can change the loan terms, and any change already scheduled. Every owner action
 * waits out the timelock's delay in public, so borrowers and lenders can react first.
 */
export function Governance({ params, audience }: { params: Params; audience: "borrow" | "lend" }) {
  const { data } = useGovernance();
  const now = useNow();
  const link = (
    <a href={addressUrl(TIMELOCK)} target="_blank" rel="noreferrer">
      Timelock
    </a>
  );
  if (!data) return null;

  if (data.pending.length === 0) {
    return (
      <p className="gov-line">
        <span className="gov-mark" aria-hidden="true" />
        <span>
          Loan terms change only after a {delayText(data.delay)} public delay. No changes scheduled.
        </span>
        {link}
      </p>
    );
  }

  return (
    <>
      {data.pending.map((op) => {
        const items = op.calls.map((c) => describeCall(c, params));
        const newMcr = items.find((i) => i.newMcr)?.newMcr;
        const left = op.readyAt - now;
        return (
          <Notice key={op.id} tone="warn">
            <strong>Scheduled change.</strong> {items.map((i) => i.text).join(". ")}.{" "}
            {left > 0 ? `It can apply from ${fmtDate(op.readyAt)}, in ${fmtDuration(left)}.` : "It can apply now."}{" "}
            {audience === "borrow" && newMcr !== undefined &&
              `If your loan is below ${fmtRatio(newMcr, 0)}, add BTC or repay before then. `}
            {link}
          </Notice>
        );
      })}
    </>
  );
}
