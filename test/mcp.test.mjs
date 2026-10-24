import test from "node:test";
import assert from "node:assert/strict";
import { parseMcpResponse } from "../src/mcp.mjs";

const msg = (id, result = { ok: true }) => JSON.stringify({ jsonrpc: "2.0", id, result });

test("parses a single SSE event", () => {
  assert.deepEqual(parseMcpResponse(`event: message\ndata: ${msg(1)}\n\n`, 1).result, { ok: true });
});

test("picks the event matching the request id among several", () => {
  const body = `data: ${JSON.stringify({ jsonrpc: "2.0", method: "notifications/progress", params: {} })}\n\n` +
    `data: ${msg(7, { v: "other" })}\n\ndata: ${msg(8, { v: "mine" })}\n\n`;
  assert.deepEqual(parseMcpResponse(body, 8).result, { v: "mine" });
});

test("handles CRLF and event without trailing blank line", () => {
  assert.equal(parseMcpResponse(`data: ${msg(2)}`, 2).id, 2);
  assert.equal(parseMcpResponse(`event: message\r\ndata: ${msg(3)}\r\n\r\n`, 3).id, 3);
});

test("accepts plain application/json body", () => {
  assert.equal(parseMcpResponse(msg(4), 4).id, 4);
});

test("joins multi-line data fields", () => {
  const pretty = JSON.stringify({ jsonrpc: "2.0", id: 5, result: { a: 1 } }, null, 1).split("\n");
  assert.equal(parseMcpResponse(pretty.map((l) => `data: ${l}`).join("\n") + "\n\n", 5).id, 5);
});

test("rejects id mismatch and empty bodies", () => {
  assert.throws(() => parseMcpResponse(`data: ${msg(9)}\n\n`, 1), /id mismatch/);
  assert.throws(() => parseMcpResponse("", 1), /no JSON-RPC response/);
  assert.throws(() => parseMcpResponse("data: not json\n\n", 1), /no JSON-RPC response/);
});
