import test from "node:test";
import assert from "node:assert/strict";
import { decideFromObservations } from "../src/guardian.mjs";

test("fires only when all three independent conditions pass", () => {
  const report = decideFromObservations({
    blockNumber: "21000000",
    nativeBalanceWei: 11n,
    tokenBalanceRaw: 20n,
    tokenDecimals: 6,
    gasPriceWei: 5n,
    thresholds: { minNativeWei: 10n, minTokenRaw: 20n, maxGasPriceWei: 5n },
  });
  assert.equal(report.decision, "FIRE");
  assert.deepEqual(report.conditions.map((item) => item.passed), [true, true, true]);
});

test("holds when a condition fails and preserves full trace", () => {
  const report = decideFromObservations({
    blockNumber: "21000000",
    nativeBalanceWei: 9n,
    tokenBalanceRaw: 20n,
    tokenDecimals: 6,
    gasPriceWei: 6n,
    thresholds: { minNativeWei: 10n, minTokenRaw: 20n, maxGasPriceWei: 5n },
  });
  assert.equal(report.decision, "HOLD");
  assert.deepEqual(report.conditions.map((item) => item.passed), [false, true, false]);
  assert.equal(report.conditions[0].block, "21000000");
  assert.equal(report.observations.tokenBalance.formatted, "0.00002");
});
