import test from "node:test";
import assert from "node:assert/strict";
import { onRequest } from "../functions/api/evaluate.js";

function context({ method = "POST", headers = {}, body = "{}" } = {}) {
  return { request: new Request("https://guardian.nampharos.web.id/api/evaluate", { method, headers, body: method === "GET" ? undefined : body }) };
}

const valid = {
  walletAddress: "0x2e1c3e80d13b03aac05aeefacc254e26d6fafb51",
  tokenAddress: "0x6b0a44c64190279f7034b77c13a566e914fe5ec4",
  thresholds: { minNativeWei: "1", minTokenRaw: "0", maxGasPriceWei: "1000000000" },
};

test("rejects non-POST", async () => {
  const response = await onRequest(context({ method: "GET" }));
  assert.equal(response.status, 405);
});

test("rejects unexpected field before live MCP work", async () => {
  const response = await onRequest(context({ headers: { "content-type": "application/json" }, body: JSON.stringify({ ...valid, directRpc: true }) }));
  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /Unsupported/);
});

test("rejects incomplete threshold policy", async () => {
  const response = await onRequest(context({ headers: { "content-type": "application/json" }, body: JSON.stringify({ ...valid, thresholds: { minNativeWei: "1" } }) }));
  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /thresholds/);
});

test("rejects cross origin", async () => {
  const response = await onRequest(context({ headers: { Origin: "https://attacker.example", "content-type": "application/json" }, body: JSON.stringify(valid) }));
  assert.equal(response.status, 403);
});

test("rejects lookalike origins of the production domain", async () => {
  for (const origin of ["https://nampharos.web.id.evil.example", "https://evilnampharos.web.id", "http://threshold.nampharos.web.id"]) {
    const response = await onRequest(context({ headers: { Origin: origin, "content-type": "application/json" }, body: JSON.stringify(valid) }));
    assert.equal(response.status, 403, origin);
  }
});

test("accepts the production subdomain origin past the origin gate", async () => {
  const response = await onRequest(context({ headers: { Origin: "https://threshold.nampharos.web.id", "content-type": "application/json" }, body: JSON.stringify({ ...valid, extra: 1 }) }));
  assert.equal(response.status, 400);
});
