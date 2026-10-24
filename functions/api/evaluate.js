import { evaluateThresholds } from "../../src/guardian.mjs";

const MAX_BODY = 2048;
const ALLOWED_ORIGIN = /^https:\/\/([a-z0-9-]+\.)?nampharos\.web\.id$/;

function json(body, status = 200, extraHeaders = {}) {
  return Response.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
      ...extraHeaders,
    },
  });
}

export async function onRequest(context) {
  const { request } = context;
  if (request.method !== "POST") return json({ error: "Method not allowed." }, 405, { Allow: "POST" });
  const origin = request.headers.get("Origin");
  const ownOrigin = new URL(request.url).origin;
  if (origin && origin !== ownOrigin && !ALLOWED_ORIGIN.test(origin)) return json({ error: "Cross-origin requests are not accepted." }, 403);
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) return json({ error: "Send input as application/json." }, 415);
  const declaredLength = request.headers.get("content-length");
  if (declaredLength && (!/^\d+$/.test(declaredLength) || Number(declaredLength) > MAX_BODY)) return json({ error: "Request body is too large." }, 413);
  let input;
  try {
    const body = await request.text();
    if (new TextEncoder().encode(body).byteLength > MAX_BODY) return json({ error: "Request body is too large." }, 413);
    input = JSON.parse(body);
  } catch {
    return json({ error: "Invalid JSON body." }, 400);
  }
  try {
    return json(await evaluateThresholds(input, { timeoutMs: 20_000 }));
  } catch (error) {
    const message = String(error?.message || "Threshold evaluation failed.").slice(0, 300);
    const status = /Invalid |must be|Unsupported |thresholds/.test(message) ? 400 : 502;
    return json({ error: message }, status);
  }
}
