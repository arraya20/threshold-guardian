export function parseMcpResponse(text, id, method = "request") {
  const trimmed = text.trim();
  const candidates = [];
  if (trimmed.startsWith("{")) {
    candidates.push(trimmed);
  } else {
    let data = [];
    const flush = () => {
      if (data.length) candidates.push(data.join("\n"));
      data = [];
    };
    for (const line of text.split(/\r?\n/)) {
      if (line === "") flush();
      else if (line.startsWith("data:")) data.push(line.slice(5).replace(/^ /, ""));
    }
    flush();
  }
  let fallback;
  for (const raw of candidates) {
    let parsed;
    try { parsed = JSON.parse(raw); } catch { continue; }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) continue;
    if (parsed.id === id) return parsed;
    if (parsed.id === undefined) continue;
    fallback ??= parsed;
  }
  if (fallback) throw new Error(`MCP response id mismatch for ${method}`);
  throw new Error(`MCP returned no JSON-RPC response for ${method}`);
}

export async function mcpRequest({ url, sessionId, id, method, params = {}, timeoutMs = 30_000 }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const headers = { "content-type": "application/json", accept: "application/json, text/event-stream" };
    if (sessionId) headers["mcp-session-id"] = sessionId;
    const response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`MCP HTTP ${response.status}: ${await response.text()}`);
    const text = await response.text();
    const message = parseMcpResponse(text, id, method);
    if (message.error) throw new Error(`${method}: ${message.error.message ?? JSON.stringify(message.error)}`);
    return { message, sessionId: response.headers.get("mcp-session-id") ?? sessionId };
  } finally {
    clearTimeout(timer);
  }
}

export async function mcpInitialize(url, timeoutMs) {
  const result = await mcpRequest({
    url,
    id: 1,
    method: "initialize",
    params: {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "pharos-threshold-guardian", version: "0.1.0" },
    },
    timeoutMs,
  });
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json, text/event-stream", "mcp-session-id": result.sessionId },
    body: JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized", params: {} }),
  });
  if (!response.ok) throw new Error(`MCP initialization notification failed: HTTP ${response.status}`);
  return result;
}

export async function mcpClose(url, sessionId, timeoutMs = 5_000) {
  if (!sessionId) return;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    await fetch(url, { method: "DELETE", headers: { "mcp-session-id": sessionId }, signal: controller.signal });
  } catch {
    // Session expiry is server-side. Cleanup never changes a completed decision.
  } finally {
    clearTimeout(timer);
  }
}
