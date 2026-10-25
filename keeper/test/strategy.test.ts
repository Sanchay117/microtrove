import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { parseEther, type Address } from "viem";
import { Mode, plan, withMargin, type Candidate, type Preview } from "../src/strategy.ts";

const PRICE = parseEther("80000");
const btcWorth = (usd: string) => (parseEther(usd) * 10n ** 18n) / PRICE;

const addr = (n: number) => `0x${n.toString(16).padStart(40, "0")}` as Address;

function candidate(n: number, preview: Partial<Preview>): Candidate {
  return {
    borrower: addr(n),
    preview: { mode: Mode.None, debt: 0n, repayAmount: 0n, collateralToLiquidator: 0n, surplus: 0n, ...preview },
  };
}

/** A matured 100 MUSD loan: repay 100, receive BTC worth 110. */
const matured = (n: number, debt = "100") =>
  candidate(n, {
    mode: Mode.Expired,
    debt: parseEther(debt),
    repayAmount: parseEther(debt),
    collateralToLiquidator: btcWorth(String(Number(debt) * 1.1)),
  });

/** Below the minimum ratio: repay the debt, receive all the collateral. */
const underwater = (n: number, debt: string, collateralUsd: string) =>
  candidate(n, {
    mode: Mode.Undercollateralized,
    debt: parseEther(debt),
    repayAmount: parseEther(debt),
    collateralToLiquidator: btcWorth(collateralUsd),
  });

const defaults = {
  price: PRICE,
  musdBalance: parseEther("1000"),
  gasCost: parseEther("0.05"),
  minProfit: parseEther("0.01"),
  maxPerTick: 10,
};

const close = (actual: bigint, expected: bigint) =>
  assert.ok(actual - expected < 10n ** 6n && expected - actual < 10n ** 6n, `${actual} != ${expected}`);

describe("plan", () => {
  it("ignores healthy troves", () => {
    const result = plan({ ...defaults, candidates: [candidate(1, { debt: parseEther("50") })] });
    assert.equal(result.liquidate.length, 0);
    assert.equal(result.skipped.length, 0);
  });

  it("prices a matured loan at the debt plus the expiry bonus, minus gas", () => {
    const [c] = plan({ ...defaults, candidates: [matured(1)] }).liquidate;
    close(c.reward, parseEther("110"));
    close(c.profit, parseEther("9.95"));
    assert.equal(c.maxRepay, withMargin(parseEther("100")));
  });

  it("liquidates undercollateralized troves before matured ones", () => {
    const result = plan({ ...defaults, candidates: [matured(1, "200"), underwater(2, "50", "53")] });
    assert.deepEqual(
      result.liquidate.map((c) => c.borrower),
      [addr(2), addr(1)],
    );
  });

  it("orders troves of the same kind by profit", () => {
    const result = plan({ ...defaults, candidates: [matured(1, "30"), matured(2, "150"), matured(3, "80")] });
    assert.deepEqual(
      result.liquidate.map((c) => c.borrower),
      [addr(2), addr(3), addr(1)],
    );
  });

  it("skips troves the keeper cannot afford and keeps funding the rest", () => {
    const result = plan({
      ...defaults,
      musdBalance: parseEther("130"),
      candidates: [matured(1, "100"), matured(2, "50"), matured(3, "25")],
    });
    assert.deepEqual(
      result.liquidate.map((c) => c.borrower),
      [addr(1), addr(3)],
    );
    assert.equal(result.skipped.length, 1);
    assert.equal(result.skipped[0].borrower, addr(2));
    assert.match(result.skipped[0].reason, /^needs 50\.05 MUSD, keeper has 29\.90$/);
  });

  it("skips liquidations that do not cover gas and the minimum profit", () => {
    const result = plan({ ...defaults, gasCost: parseEther("3"), candidates: [matured(1, "25")] });
    assert.equal(result.liquidate.length, 0);
    assert.match(result.skipped[0].reason, /^earns -\$0\.50 after gas/);
  });

  it("respects the per-scan limit", () => {
    const result = plan({ ...defaults, maxPerTick: 2, candidates: [matured(1), matured(2), matured(3)] });
    assert.equal(result.liquidate.length, 2);
    assert.equal(result.skipped[0].reason, "per-scan limit reached");
  });

  it("still liquidates an underwater trove at the guaranteed bonus", () => {
    // Collateral worth 95 against 100 of debt: the contract cuts the repayment to 95 / 1.05.
    const repay = (parseEther("95") * 10_000n) / 10_500n;
    const c = candidate(1, {
      mode: Mode.Undercollateralized,
      debt: parseEther("100"),
      repayAmount: repay,
      collateralToLiquidator: btcWorth("95"),
    });
    const [planned] = plan({ ...defaults, candidates: [c] }).liquidate;
    close(planned.profit, parseEther("95") - repay - defaults.gasCost);
    assert.ok(planned.profit > 0n);
  });
});
