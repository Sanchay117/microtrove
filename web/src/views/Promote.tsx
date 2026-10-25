import { useState } from "react";
import { useAccount, usePublicClient, useReadContracts, useSignTypedData, useWriteContract } from "wagmi";
import { addresses, CHAIN_ID, MUSD_GAS_COMPENSATION, MUSD_MCR } from "../config";
import { borrowerOperationsAbi, borrowerOperationsSignaturesAbi, hintHelpersAbi, sortedTrovesAbi, troveManagerAbi } from "../abi/mezo";
import { loans } from "../hooks/useProtocol";
import { useAccountState, type Trove } from "../hooks/useAccountState";
import { useTx } from "../tx";
import { AmountInput, Card, Notice, Row } from "../components/ui";
import { ONE, collateralFor, collateralValue, icr } from "../lib/math";
import { fmtBtc, fmtMusd, fmtRatio, fmtUsd, parseAmount, toInput } from "../lib/format";
import { GAS_RESERVE } from "../lib/loan";

const MUSD_CCR = 15n * 10n ** 17n;
const NICR_PRECISION = 10n ** 20n;
const TARGET_RATIO = 16n * 10n ** 17n;

// EIP-712 message checked by MUSD's BorrowerOperationsSignatures.openTroveWithSignature.
const openTroveTypes = {
  OpenTrove: [
    { name: "assetAmount", type: "uint256" },
    { name: "debtAmount", type: "uint256" },
    { name: "borrower", type: "address" },
    { name: "recipient", type: "address" },
    { name: "nonce", type: "uint256" },
    { name: "deadline", type: "uint256" },
  ],
} as const;

/** Moves the micro trove into a full MUSD trove in one transaction (RFC-2 promotion). */
export function Promote({ trove, price }: { trove: Trove; price: bigint }) {
  const { address } = useAccount();
  const { data: account } = useAccountState();
  const client = usePublicClient();
  const { signTypedDataAsync } = useSignTypedData();
  const { writeContractAsync } = useWriteContract();
  const { run, busy } = useTx();
  const [debtIn, setDebtIn] = useState("1800");
  const [extraIn, setExtraIn] = useState<string | null>(null);

  const debt = parseAmount(debtIn) ?? 0n;
  const reads = useReadContracts({
    allowFailure: false,
    contracts: [
      { address: addresses.borrowerOperations, abi: borrowerOperationsAbi, functionName: "minNetDebt" },
      { address: addresses.borrowerOperations, abi: borrowerOperationsAbi, functionName: "getBorrowingFee", args: [debt] },
      { address: addresses.troveManager, abi: troveManagerAbi, functionName: "checkRecoveryMode", args: [price] },
    ],
  });
  const [minNetDebt, fee, recoveryMode] = reads.data ?? [1_800n * ONE, 0n, false];
  // In recovery mode MUSD charges no fee and requires the critical ratio.
  const effectiveFee = recoveryMode ? 0n : fee;
  const required = recoveryMode ? MUSD_CCR : MUSD_MCR;
  const composite = debt + effectiveFee + MUSD_GAS_COMPENSATION;

  const suggestedTotal = collateralFor(composite, TARGET_RATIO, price);
  const suggestedExtra = suggestedTotal > trove.collateral ? suggestedTotal - trove.collateral : 0n;
  const extra = extraIn === null ? suggestedExtra : parseAmount(extraIn) ?? 0n;
  const extraDisplay = extraIn === null ? toInput(suggestedExtra, 8) : extraIn;
  const totalColl = trove.collateral + extra;
  const newRatio = icr(totalColl, composite, price);
  const youGet = debt > trove.debt ? debt - trove.debt : 0n;
  const btc = account?.btc ?? 0n;

  let error: string | undefined;
  if (account?.hasMusdTrove) error = "This wallet already has an MUSD trove";
  else if (debt + effectiveFee < minNetDebt) error = `MUSD troves start at ${fmtMusd(minNetDebt, 0)} MUSD`;
  else if (debt < trove.debt) error = "Borrow enough to repay the micro loan";
  else if (extra + GAS_RESERVE > btc) error = "Not enough BTC in your wallet";
  else if (newRatio === undefined || newRatio < required) error = `MUSD troves need at least ${fmtRatio(required, 0)}`;

  const submit = () =>
    run("Promote to an MUSD trove", async () => {
      if (!client || !address) throw new Error("Connect a wallet first.");
      const nicr = (totalColl * NICR_PRECISION) / composite;
      const count = await client.readContract({
        address: addresses.troveManager,
        abi: troveManagerAbi,
        functionName: "getTroveOwnersCount",
      });
      const trials = BigInt(Math.ceil(15 * Math.sqrt(Number(count)))) + 1n;
      const [approx] = await client.readContract({
        address: addresses.hintHelpers,
        abi: hintHelpersAbi,
        functionName: "getApproxHint",
        args: [nicr, trials, BigInt(Math.floor(Math.random() * 1e9))],
      });
      const [upper, lower] = await client.readContract({
        address: addresses.sortedTroves,
        abi: sortedTrovesAbi,
        functionName: "findInsertPosition",
        args: [nicr, approx, approx],
      });
      const nonce = await client.readContract({
        address: addresses.borrowerOperationsSignatures,
        abi: borrowerOperationsSignaturesAbi,
        functionName: "getNonce",
        args: [address],
      });
      const deadline = BigInt(Math.floor(Date.now() / 1000) + 30 * 60);
      const signature = await signTypedDataAsync({
        domain: {
          name: "BorrowerOperationsSignatures",
          version: "1",
          chainId: CHAIN_ID,
          verifyingContract: addresses.borrowerOperationsSignatures,
        },
        types: openTroveTypes,
        primaryType: "OpenTrove",
        message: {
          assetAmount: totalColl,
          debtAmount: debt,
          borrower: address,
          recipient: addresses.loans,
          nonce,
          deadline,
        },
      });
      return writeContractAsync({
        ...loans,
        functionName: "promote",
        args: [debt, upper, lower, signature, deadline],
        value: extra,
      });
    });

  return (
    <Card index="1.3" title="Grow into a full MUSD trove">
      <p className="lead">
        When you are ready for more, promote this position. You sign MUSD's own <code>OpenTrove</code> message, then one
        transaction moves your BTC into a new MUSD trove, repays this loan from it and sends you the rest.
      </p>
      <div className="form">
        <AmountInput label="MUSD trove debt" unit="MUSD" value={debtIn} onChange={setDebtIn} hint={`Min ${fmtMusd(minNetDebt, 0)}`} />
        <AmountInput
          label="Add BTC"
          unit="BTC"
          value={extraDisplay}
          onChange={setExtraIn}
          hint={extraIn === null ? `Suggested for ${fmtRatio(TARGET_RATIO, 0)}` : `Wallet: ${fmtBtc(btc)} BTC`}
        />
        <Row label="BTC in the new trove" value={`${fmtBtc(totalColl)} BTC (${fmtUsd(collateralValue(totalColl, price))})`} />
        <Row label="Trove debt incl. fee and 200 MUSD gas deposit" value={`${fmtMusd(composite)} MUSD`} />
        <Row label="New collateral ratio" value={fmtRatio(newRatio)} tone={newRatio !== undefined && newRatio < required ? "bad" : undefined} />
        <Row label="Micro loan repaid" value={`${fmtMusd(trove.debt)} MUSD`} />
        <Row label="You receive" value={`${fmtMusd(youGet)} MUSD`} />
        {recoveryMode && <Notice tone="warn">MUSD is in recovery mode, so new troves need 150% and pay no fee.</Notice>}
        <button className="btn btn-secondary btn-lg" disabled={!!error || busy} onClick={submit}>
          {error ?? "Sign and promote"}
        </button>
      </div>
    </Card>
  );
}
