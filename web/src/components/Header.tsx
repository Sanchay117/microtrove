import { useEffect, useRef, useState } from "react";
import { useAccount, useConnect, useDisconnect, useSwitchChain } from "wagmi";
import { mezoTestnet } from "viem/chains";
import { usePrice } from "../hooks/useProtocol";
import { useAccountState } from "../hooks/useAccountState";
import { fmtBtc, fmtMusd, fmtPrice, shortAddr } from "../lib/format";
import { FAUCET, addressUrl } from "../config";
import { BITCOIN_WALLETS, bitcoinAddressOf, type BitcoinWalletId } from "../bitcoin";

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

type Connector = ReturnType<typeof useConnect>["connectors"][number];

const hasInjected = typeof window !== "undefined" && "ethereum" in window;
const isPhone = typeof navigator !== "undefined" && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
// On a phone with no wallet browser, MetaMask's universal link reopens this page inside the app.
const openInApp =
  isPhone && !hasInjected && typeof location !== "undefined"
    ? `https://metamask.app.link/dapp/${location.host}${location.pathname}${location.hash}`
    : undefined;

/**
 * Wallets that announced themselves over EIP-6963 come first with their own names and icons. The generic
 * injected entry only shows when nothing announced, and Coinbase's SDK only when its extension did not.
 */
function walletOptions(connectors: readonly Connector[]) {
  const announced = connectors.filter((c) => c.type === "injected" && c.id !== "injected");
  const options: { connector: Connector; label: string; hint?: string }[] = announced.map((c) => ({
    connector: c,
    label: c.name,
  }));
  for (const c of connectors) {
    if (c.id === "injected" && announced.length === 0 && hasInjected) options.push({ connector: c, label: "Browser wallet" });
    if (c.id === "coinbaseWalletSDK" && !announced.some((a) => a.id === "com.coinbase.wallet"))
      options.push({ connector: c, label: "Coinbase Wallet", hint: hasInjected ? undefined : "Extension or mobile app" });
    if (c.id === "walletConnect") options.push({ connector: c, label: "WalletConnect", hint: "Scan with a phone wallet" });
    if (c.id === "burner") options.push({ connector: c, label: c.name, hint: "Local testing only" });
  }
  return options;
}

function WalletButton() {
  const { address, chainId, isConnected, connector } = useAccount();
  const { connectors, connect, isPending, error } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain, isPending: switching } = useSwitchChain();
  const { data } = useAccountState();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const [btcAddress, setBtcAddress] = useState<string>();

  useEffect(() => {
    let live = true;
    setBtcAddress(undefined);
    if (isConnected) bitcoinAddressOf(connector).then((a) => live && setBtcAddress(a));
    return () => {
      live = false;
    };
  }, [connector, isConnected, address]);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    // The first-loan guide's "Connect wallet" button opens this menu.
    const show = () => setOpen(true);
    document.addEventListener("mousedown", close);
    window.addEventListener("microtrove:connect", show);
    return () => {
      document.removeEventListener("mousedown", close);
      window.removeEventListener("microtrove:connect", show);
    };
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
              {btcAddress ? (
                <div className="menu-section">
                  <div className="menu-label">Connected with {connector?.name} through Mezo Passport</div>
                  <div className="menu-address" title={btcAddress}>{shortAddr(btcAddress)}</div>
                  <div className="menu-label menu-label-gap">Your Mezo account</div>
                  <a className="menu-address" href={addressUrl(address)} target="_blank" rel="noreferrer">
                    {shortAddr(address)}
                  </a>
                  <p className="menu-note">
                    A smart account your Bitcoin wallet controls. Send testnet BTC to it from the faucet, then borrow.
                  </p>
                </div>
              ) : (
                <div className="menu-section">
                  <div className="menu-label">Connected with {connector?.name}</div>
                  <a className="menu-address" href={addressUrl(address)} target="_blank" rel="noreferrer">
                    {shortAddr(address)}
                  </a>
                </div>
              )}
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
              {walletOptions(connectors).map(({ connector: c, label, hint }) => (
                <button
                  key={c.uid}
                  className="menu-item wallet-option"
                  onClick={() => connect({ connector: c, chainId: mezoTestnet.id }, { onSuccess: () => setOpen(false) })}
                >
                  {c.icon ? (
                    <img className="wallet-icon" src={c.icon} alt="" />
                  ) : (
                    <span className="wallet-icon wallet-icon-letter" aria-hidden>
                      {label[0]}
                    </span>
                  )}
                  <span className="wallet-name">
                    {label}
                    {hint && <small>{hint}</small>}
                  </span>
                </button>
              ))}
              {openInApp && (
                <a className="menu-item wallet-option" href={openInApp}>
                  <span className="wallet-icon wallet-icon-letter" aria-hidden>
                    M
                  </span>
                  <span className="wallet-name">
                    Open in MetaMask
                    <small>Use the app's built-in browser</small>
                  </span>
                </a>
              )}
              <BitcoinWalletOptions
                connectors={connectors}
                onPick={(c) => connect({ connector: c, chainId: mezoTestnet.id }, { onSuccess: () => setOpen(false) })}
              />
              {error && <div className="menu-error">{error.message.split("\n")[0]}</div>}
              <div className="menu-foot">
                Works with any EVM wallet, or a Bitcoin wallet through Mezo Passport. The app adds Mezo Testnet
                (chain 31611) for you.
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

/** Bitcoin wallets through Mezo Passport: connect if installed, otherwise link to the wallet. */
function BitcoinWalletOptions({ connectors, onPick }: { connectors: readonly Connector[]; onPick: (c: Connector) => void }) {
  const [icons, setIcons] = useState<Record<BitcoinWalletId, string>>();
  useEffect(() => {
    import("../bitcoinIcons").then((m) => setIcons(m.default)).catch(() => undefined);
  }, []);

  // Phones have no Bitcoin wallet extensions; list one only inside its own in-app browser.
  const wallets = BITCOIN_WALLETS.filter((w) => !isPhone || w.detect());
  if (wallets.length === 0) return null;

  return (
    <>
      <div className="menu-label menu-group">Bitcoin wallets · Mezo Passport</div>
      {wallets.map((w) => {
        const connector = connectors.find((c) => c.id === w.id);
        const icon = icons?.[w.id] ? (
          <img className="wallet-icon" src={icons[w.id]} alt="" />
        ) : (
          <span className="wallet-icon wallet-icon-letter" aria-hidden>
            {w.name[0]}
          </span>
        );
        return w.detect() && connector ? (
          <button key={w.id} className="menu-item wallet-option" onClick={() => onPick(connector)}>
            {icon}
            <span className="wallet-name">
              {w.name}
              <small>Sign with Bitcoin, borrow from a Mezo smart account</small>
            </span>
          </button>
        ) : (
          <a key={w.id} className="menu-item wallet-option" href={w.download} target="_blank" rel="noreferrer">
            {icon}
            <span className="wallet-name">
              {w.name}
              <small>Not installed. Get the extension</small>
            </span>
          </a>
        );
      })}
    </>
  );
}
