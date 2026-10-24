import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const html = await readFile(new URL("../public/index.html", import.meta.url), "utf8");
const headers = await readFile(new URL("../public/_headers", import.meta.url), "utf8");

test("CSP forbids inline script, so page must not contain any", () => {
  assert.match(headers, /script-src 'self'(?!.*unsafe-inline)/);
  const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)];
  assert.ok(scripts.length > 0, "page loads a script");
  for (const [, attrs, body] of scripts) {
    assert.match(attrs, /\bsrc="\/[^"]+"/, "script must be external");
    assert.equal(body.trim(), "", "script must have no inline body");
  }
});

test("external script referenced by page exists", async () => {
  const src = html.match(/<script[^>]*src="\/([^"]+)"/)[1];
  const code = await readFile(new URL(`../public/${src}`, import.meta.url), "utf8");
  assert.match(code, /\/api\/evaluate/);
});
