import { useEffect, useState } from "react";
import { Header, type Tab } from "./components/Header";
import { Borrow } from "./views/Borrow";
import { Lend } from "./views/Lend";
import { Keepers } from "./views/Keepers";
import { addressUrl, addresses } from "./config";

const fromHash = (): Tab => {
  const h = window.location.hash.replace("#", "");
  return h === "lend" || h === "keepers" ? h : "borrow";
};

export function App() {
  const [tab, setTab] = useState<Tab>(fromHash);

  useEffect(() => {
    const onHash = () => setTab(fromHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  return (
    <>
      <Header tab={tab} onTab={setTab} />
      <main className="main">
        {tab === "borrow" && <Borrow />}
        {tab === "lend" && <Lend />}
        {tab === "keepers" && <Keepers />}
      </main>
      <footer className="footer">
        <span>
          Microtrove on Mezo Testnet. Implements{" "}
          <a href="https://github.com/mezo-org/musd/blob/rfc-2/docs/rfc/rfc-2.md" target="_blank" rel="noreferrer">
            RFC-2
          </a>{" "}
          microloans on top of MUSD.
        </span>
        <span className="footer-links">
          <a href={addressUrl(addresses.loans)} target="_blank" rel="noreferrer">Loan book</a>
          <a href={addressUrl(addresses.vault)} target="_blank" rel="noreferrer">Vault</a>
        </span>
      </footer>
    </>
  );
}
