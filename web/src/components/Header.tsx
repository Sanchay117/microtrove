import { useEffect, useRef, useState } from "react";
import { useAccount, useConnect, useDisconnect, useSwitchChain } from "wagmi";
import { mezoTestnet } from "viem/chains";
import { usePrice } from "../hooks/useProtocol";
import { useAccountState } from "../hooks/useAccountState";
import { fmtBtc, fmtMusd, fmtPrice, shortAddr } from "../lib/format";
import { FAUCET, addressUrl } from "../config";

export type Tab = "borrow" | "lend" | "keepers";

const tabs: { id: Tab; index: string; label: string }[] = [
  { id: "borrow", index: "01", label: "Borrow" },
  { id: "lend", index: "02", label: "Lend" },
  { id: "keepers", index: "03", label: "Keepers" },
];

export function Header({ tab, onTab }: { tab: Tab; onTab: (tab: Tab) => void }) {
  const { price, stale } = usePrice();
  return (
    <header className="topbar">
      <div className="topbar-inner">
        <a className="brand" href="#borrow" onClick={() => onTab("borrow")}>
          <span className="brand-mark" aria-hidden />
          microtrove
        </a>
        <nav className="tabs" aria-label="Sections">
          {tabs.map((t) => (
            <a
              key={t.id}
              href={`#${t.id}`}
              className={tab === t.id ? "active" : ""}
              aria-current={tab === t.id ? "page" : undefined}
              onClick={() => onTab(t.id)}
            >
              <span className="tab-n">{t.index}</span>
              {t.label}
            </a>
          ))}
        </nav>
        <div className="topbar-right">
          <span className={`price-pill ${stale ? "is-stale" : ""}`} title="BTC/USD from MUSD's PriceFeed">
            BTC/USD <strong>{stale ? "stale" : fmtPrice(price).replace("$", "")}</strong>
          </span>
          <WalletButton />
        </div>
      </div>
    </header>
  );
}

function WalletButton() {
  const { address, chainId, isConnected, connector } = useAccount();
  const { connectors, connect, isPending, error } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain, isPending: switching } = useSwitchChain();
  const { data } = useAccountState();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  if (isConnected && chainId !== mezoTestnet.id) {
    return (
      <button className="btn btn-warn" disabled={switching} onClick={() => switchChain({ chainId: mezoTestnet.id })}>
        {switching ? "Switching..." : "Switch to Mezo Testnet"}
      </button>
    );
  }

  return (
    <div className="wallet" ref={ref}>
      {isConnected && address ? (
        <button className="btn btn-ghost wallet-btn" onClick={() => setOpen(!open)} aria-expanded={open}>
          <span className="wallet-dot" />
          {shortAddr(address)}
        </button>
      ) : (
        <button className="btn btn-primary" disabled={isPending} onClick={() => setOpen(!open)} aria-expanded={open}>
          {isPending ? "Connecting..." : "Connect wallet"}
        </button>
      )}
      {open && (
        <div className="menu">
          {isConnected && address ? (
            <>
              <div className="menu-section">
                <div className="menu-label">Connected with {connector?.name}</div>
                <a className="menu-address" href={addressUrl(address)} target="_blank" rel="noreferrer">
                  {shortAddr(address)}
                </a>
              </div>
              <div className="menu-section menu-balances">
                <div><span>BTC</span><strong>{fmtBtc(data?.btc)}</strong></div>
                <div><span>MUSD</span><strong>{fmtMusd(data?.musd)}</strong></div>
              </div>
              <a className="menu-item" href={FAUCET} target="_blank" rel="noreferrer">
                Get testnet BTC
              </a>
              <button className="menu-item" onClick={() => { disconnect(); setOpen(false); }}>
                Disconnect
              </button>
            </>
          ) : (
            <>
              <div className="menu-label">Choose a wallet</div>
              {connectors.map((c) => (
                <button
                  key={c.uid}
                  className="menu-item"
                  onClick={() => connect({ connector: c, chainId: mezoTestnet.id }, { onSuccess: () => setOpen(false) })}
                >
                  {c.name === "Injected" ? "Browser wallet" : c.name}
                </button>
              ))}
              {error && <div className="menu-error">{error.message.split("\n")[0]}</div>}
              <div className="menu-foot">
                Works with any EVM wallet. The app adds Mezo Testnet (chain 31611) for you.
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
