// The narration, scene by scene. `text` is the caption; `say` (when present) is what the voice reads,
// spelled for speech. Shared by scripts/tts.ts (audio) and the Remotion composition (timing and captions).

export interface Line {
  text: string;
  say?: string;
}

export interface SceneScript {
  id: string;
  lines: Line[];
  /** Seconds of picture before the first line and after the last. */
  lead?: number;
  tail?: number;
}

export const VOICE = "aura-2-thalia-en";

export const SCRIPT: SceneScript[] = [
  {
    id: "open",
    lead: 1.0,
    tail: 0.6,
    lines: [
      { text: "Mezo’s MUSD lets you borrow against bitcoin.", say: "Mezo’s M.U.S.D. lets you borrow against bitcoin." },
      {
        text: "But a trove starts at 1,800 MUSD, so trying it means locking about $2,200 of bitcoin.",
        say: "But a trove starts at eighteen hundred M.U.S.D, so trying it means locking about twenty-two hundred dollars of bitcoin.",
      },
    ],
  },
  {
    id: "rfc",
    lead: 0.3,
    tail: 1.1,
    lines: [
      { text: "Mezo designed the fix, RFC-2 microloans, but never shipped it.", say: "Mezo designed the fix, R.F.C. two microloans, but never shipped it." },
      { text: "So we built it. Microtrove." },
    ],
  },
  {
    id: "borrow",
    lead: 0.5,
    tail: 0.8,
    lines: [
      {
        text: "Borrow 25 to 200 MUSD against as little as $50 of bitcoin, at a fixed 5%.",
        say: "Borrow twenty-five to two hundred M.U.S.D. against as little as fifty dollars of bitcoin, at a fixed five percent.",
      },
      { text: "Pick an amount and a ratio, and see exactly what you owe." },
      {
        text: "One transaction locks the BTC and sends the MUSD, live on Mezo Testnet.",
        say: "One transaction locks the bitcoin and sends the M.U.S.D., live on Mezo testnet.",
      },
    ],
  },
  {
    id: "lenders",
    lead: 0.4,
    tail: 0.8,
    lines: [
      {
        text: "The MUSD comes from lenders, through a vault anyone can fund.",
        say: "The M.U.S.D. comes from lenders, through a vault that anyone can fund.",
      },
      { text: "They earn the interest and fees, and withdraw any time: instantly, or first in, first out." },
    ],
  },
  {
    id: "keepers",
    lead: 0.4,
    tail: 0.8,
    lines: [
      { text: "Keepers liquidate loans below 110% or past their due date.", say: "Keepers liquidate loans below a hundred and ten percent, or past their due date." },
      {
        text: "RFC-2 paid them 10% of the collateral: at most half the debt they repay. Nobody would.",
        say: "R.F.C. two paid them ten percent of the collateral: at most, half the debt they repay. Nobody would.",
      },
      { text: "We pay BTC worth the debt plus 10%, and the borrower claims the rest.", say: "We pay bitcoin worth the debt plus ten percent, and the borrower claims the rest." },
    ],
  },
  {
    id: "proof",
    lead: 0.4,
    tail: 0.9,
    lines: [
      {
        text: "Then we proved it live. Our keeper bot liquidated a matured loan 48 seconds after its due date, for $3.98 profit and no bad debt.",
        say: "Then we proved it live. Our keeper bot liquidated a matured loan forty-eight seconds after its due date, for three dollars ninety-eight profit, and no bad debt.",
      },
      { text: "The borrower claimed the leftover BTC in the app.", say: "The borrower claimed the leftover bitcoin in the app." },
    ],
  },
  {
    id: "terms",
    lead: 0.4,
    tail: 0.8,
    lines: [
      {
        text: "Wave 1’s review found the owner could change loan terms at once.",
        say: "Wave one’s review found that the owner could change loan terms at once.",
      },
      {
        text: "Now a timelock owns both contracts. Every change waits 24 hours in public, and the app counts it down.",
        say: "Now a timelock owns both contracts. Every change waits twenty-four hours in public, and the app counts it down.",
      },
    ],
  },
  {
    id: "promote",
    lead: 0.4,
    tail: 0.8,
    lines: [
      {
        text: "When a borrower outgrows a micro trove, they sign MUSD’s own OpenTrove message.",
        say: "When a borrower outgrows a micro trove, they sign M.U.S.D.’s own Open Trove message.",
      },
      {
        text: "One transaction opens a full MUSD trove, repays the micro loan and sends them the rest.",
        say: "One transaction opens a full M.U.S.D. trove, repays the micro loan, and sends them the rest.",
      },
      {
        text: "We ran it live: a 100 MUSD loan became a full trove with 1,800 MUSD of debt.",
        say: "We ran it live: a hundred M.U.S.D. loan became a full trove, with eighteen hundred M.U.S.D. of debt.",
      },
      { text: "Microtrove feeds new borrowers into MUSD instead of competing with it.", say: "Microtrove feeds new borrowers into M.U.S.D., instead of competing with it." },
    ],
  },
  {
    id: "passport",
    lead: 0.4,
    tail: 0.9,
    lines: [
      { text: "And Bitcoin wallets can borrow now, through Mezo Passport." },
      {
        text: "Unisat signs a Bitcoin message, a smart account on Mezo opens the loan, and Mezo’s relayer sends it.",
        say: "Unisat signs a bitcoin message, a smart account on Mezo opens the loan, and Mezo’s relayer sends it.",
      },
      {
        text: "Gas fees come out of the account’s BTC, so there is no EVM wallet to set up.",
        say: "Gas fees come out of the account’s bitcoin, so there is no E.V.M. wallet to set up.",
      },
    ],
  },
  {
    id: "mezo",
    lead: 0.3,
    tail: 0.9,
    lines: [
      {
        text: "It runs on Mezo’s own pieces: MUSD, its PriceFeed, BorrowerOperations, HintHelpers, TroveManager and Passport.",
        say: "It runs on Mezo’s own pieces: M.U.S.D., its Price Feed, Borrower Operations, Hint Helpers, Trove Manager, and Passport.",
      },
    ],
  },
  {
    id: "shipped",
    lead: 0.3,
    tail: 0.8,
    lines: [
      {
        text: "67 Foundry tests, six fork tests against Mezo, three verified contracts, and a keeper that runs every five minutes. Live on testnet today.",
        say: "Sixty-seven Foundry tests, six fork tests against Mezo, three verified contracts, and a keeper that runs every five minutes. Live on testnet today.",
      },
    ],
  },
  {
    id: "outro",
    lead: 0.5,
    tail: 2.2,
    lines: [{ text: "Microtrove. Start with $50 of bitcoin. Grow into MUSD.", say: "Microtrove. Start with fifty dollars of bitcoin. Grow into M.U.S.D." }],
  },
];
