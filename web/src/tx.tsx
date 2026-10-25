import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import { erc20Abi, type Address, type Hex } from "viem";
import { useAccount, usePublicClient, useWriteContract } from "wagmi";
import { useQueryClient } from "@tanstack/react-query";
import { errorMessage } from "./lib/errors";
import { txUrl } from "./config";

type ToastStatus = "wallet" | "pending" | "done" | "error";
type Toast = { id: number; label: string; status: ToastStatus; hash?: Hex; message?: string };

type TxApi = {
  /** Sends one transaction, tracks it in a toast and refreshes reads. Resolves true on success. */
  run: (label: string, send: () => Promise<Hex>) => Promise<boolean>;
  /** Approves `amount` of `token` for `spender` if the current allowance is lower. */
  ensureAllowance: (token: Address, spender: Address, amount: bigint, label: string) => Promise<boolean>;
  busy: boolean;
};

const TxContext = createContext<TxApi | null>(null);

export function TxProvider({ children }: { children: ReactNode }) {
  const client = usePublicClient();
  const { address } = useAccount();
  const { writeContractAsync } = useWriteContract();
  const queryClient = useQueryClient();
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [busy, setBusy] = useState(false);
  const nextId = useRef(1);

  const update = (id: number, patch: Partial<Toast>) =>
    setToasts((all) => all.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  const dismiss = (id: number) => setToasts((all) => all.filter((t) => t.id !== id));

  const run = useCallback(
    async (label: string, send: () => Promise<Hex>) => {
      const id = nextId.current++;
      setToasts((all) => [...all.slice(-3), { id, label, status: "wallet" }]);
      setBusy(true);
      try {
        const hash = await send();
        update(id, { status: "pending", hash });
        const receipt = await client!.waitForTransactionReceipt({ hash, pollingInterval: 2_000 });
        if (receipt.status !== "success") throw new Error("Transaction reverted.");
        update(id, { status: "done" });
        setTimeout(() => dismiss(id), 6_000);
        return true;
      } catch (error) {
        update(id, { status: "error", message: errorMessage(error) });
        return false;
      } finally {
        setBusy(false);
        await queryClient.invalidateQueries();
      }
    },
    [client, queryClient],
  );

  const ensureAllowance = useCallback(
    async (token: Address, spender: Address, amount: bigint, label: string) => {
      if (!address || !client) return false;
      const allowance = await client.readContract({
        address: token,
        abi: erc20Abi,
        functionName: "allowance",
        args: [address, spender],
      });
      if (allowance >= amount) return true;
      return run(label, () =>
        writeContractAsync({ address: token, abi: erc20Abi, functionName: "approve", args: [spender, amount] }),
      );
    },
    [address, client, run, writeContractAsync],
  );

  return (
    <TxContext.Provider value={{ run, ensureAllowance, busy }}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast-${t.status}`}>
            <div className="toast-head">
              <span className="toast-dot" />
              <strong>{t.label}</strong>
              <button className="toast-close" onClick={() => dismiss(t.id)} aria-label="Dismiss">
                ×
              </button>
            </div>
            <div className="toast-body">
              {t.status === "wallet" && "Confirm in your wallet"}
              {t.status === "pending" && "Waiting for confirmation"}
              {t.status === "done" && "Confirmed"}
              {t.status === "error" && t.message}
              {t.hash && (
                <a href={txUrl(t.hash)} target="_blank" rel="noreferrer">
                  View transaction
                </a>
              )}
            </div>
          </div>
        ))}
      </div>
    </TxContext.Provider>
  );
}

export function useTx() {
  const api = useContext(TxContext);
  if (!api) throw new Error("useTx must be used inside TxProvider");
  return api;
}
