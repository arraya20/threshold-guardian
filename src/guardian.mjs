import {
  ERC20_SELECTORS,
  MCP_URL,
  PHAROS_CHAIN_ID,
  decodeUint,
  encodeAddressCall,
  formatUnits,
  requireAddress,
  requireDecimal,
  requireHex,
} from "./abi.mjs";
import { mcpClose, mcpInitialize, mcpRequest } from "./mcp.mjs";

const REQUIRED_TOOLS = ["get_chain_info", "get_block_number", "get_balance", "get_gas_price", "get_code", "eth_call"];

function toolResult(message, toolName) {
  const result = message.result;
  if (!result) throw new Error(`${toolName} returned no result`);
  if (result.isError) {
    const detail = result.content?.filter((item) => item.type === "text").map((item) => item.text).join("\n");
    throw new Error(`${toolName} failed${detail ? `: ${detail}` : ""}`);
  }
  const text = result.content?.find((item) => item.type === "text")?.text;
  if (!text) throw new Error(`${toolName} returned no text result`);
  try { return JSON.parse(text); } catch { throw new Error(`${toolName} returned invalid JSON`); }
}

function parseQuantity(value, label) {
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) return BigInt(value);
  if (typeof value !== "string") throw new Error(`${label} returned an invalid quantity`);
  if (/^0x[0-9a-fA-F]+$/.test(value)) return BigInt(value);
  return requireDecimal(value, `${label} result`);
}

function validateInput(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Expected a JSON object");
  const allowed = new Set(["walletAddress", "tokenAddress", "thresholds"]);
  if (Object.keys(input).some((key) => !allowed.has(key))) throw new Error("Unsupported input field");
  const walletAddress = requireAddress(input.walletAddress, "wallet address");
  const tokenAddress = requireAddress(input.tokenAddress, "token address");
  const thresholds = input.thresholds;
  if (!thresholds || typeof thresholds !== "object" || Array.isArray(thresholds)) throw new Error("thresholds must be an object");
  const keys = new Set(["minNativeWei", "minTokenRaw", "maxGasPriceWei"]);
  if (Object.keys(thresholds).some((key) => !keys.has(key)) || [...keys].some((key) => !(key in thresholds))) {
    throw new Error("thresholds must include minNativeWei, minTokenRaw, and maxGasPriceWei only");
  }
  return {
    walletAddress,
    tokenAddress,
    thresholds: {
      minNativeWei: requireDecimal(thresholds.minNativeWei, "minNativeWei"),
      minTokenRaw: requireDecimal(thresholds.minTokenRaw, "minTokenRaw"),
      maxGasPriceWei: requireDecimal(thresholds.maxGasPriceWei, "maxGasPriceWei", { min: 1n }),
    },
  };
}

function condition({ id, label, operator, actual, threshold, passed, unit, block }) {
  return { id, label, operator, actual: actual.toString(), threshold: threshold.toString(), passed, unit, ...(block ? { block } : {}) };
}

export function decideFromObservations({ blockNumber, nativeBalanceWei, tokenBalanceRaw, tokenDecimals, gasPriceWei, thresholds }) {
  const conditions = [
    condition({ id: "native-balance", label: "Native PROS balance", operator: ">=", actual: nativeBalanceWei, threshold: thresholds.minNativeWei, passed: nativeBalanceWei >= thresholds.minNativeWei, unit: "wei", block: blockNumber }),
    condition({ id: "token-balance", label: "ERC-20 balance", operator: ">=", actual: tokenBalanceRaw, threshold: thresholds.minTokenRaw, passed: tokenBalanceRaw >= thresholds.minTokenRaw, unit: "raw token units", block: blockNumber }),
    condition({ id: "gas-price", label: "Gas price", operator: "<=", actual: gasPriceWei, threshold: thresholds.maxGasPriceWei, passed: gasPriceWei <= thresholds.maxGasPriceWei, unit: "wei" }),
  ];
  return {
    decision: conditions.every((item) => item.passed) ? "FIRE" : "HOLD",
    conditions,
    observations: {
      nativeBalance: { wei: nativeBalanceWei.toString(), pros: formatUnits(nativeBalanceWei, 18) },
      tokenBalance: { raw: tokenBalanceRaw.toString(), formatted: formatUnits(tokenBalanceRaw, tokenDecimals), decimals: tokenDecimals },
      gasPrice: { wei: gasPriceWei.toString(), gwei: formatUnits(gasPriceWei, 9) },
    },
  };
}

export async function evaluateThresholds(input, { mcpUrl = MCP_URL, timeoutMs = 30_000 } = {}) {
  const request = validateInput(input);
  let sessionId;
  try {
    const initialized = await mcpInitialize(mcpUrl, timeoutMs);
    sessionId = initialized.sessionId;
    const list = await mcpRequest({ url: mcpUrl, sessionId, id: 3, method: "tools/list", timeoutMs });
    const available = new Set((list.message.result?.tools ?? []).map((tool) => tool.name));
    const missing = REQUIRED_TOOLS.filter((tool) => !available.has(tool));
    if (missing.length) throw new Error(`Pharos MCP is missing required tools: ${missing.join(", ")}`);

    let id = 10;
    async function callTool(name, args = {}) {
      const response = await mcpRequest({ url: mcpUrl, sessionId, id: id++, method: "tools/call", params: { name, arguments: args }, timeoutMs });
      return toolResult(response.message, name);
    }

    const [chain, latest] = await Promise.all([callTool("get_chain_info"), callTool("get_block_number")]);
    if (Number(chain.chainId) !== PHAROS_CHAIN_ID) throw new Error(`Expected Pharos chain ID ${PHAROS_CHAIN_ID}, received ${chain.chainId}`);
    const blockNumber = String(latest.blockNumber);
    if (!/^\d+$/.test(blockNumber)) throw new Error("get_block_number returned an invalid block number");

    const [code, balance, decimalsResult, tokenBalanceResult, gas] = await Promise.all([
      callTool("get_code", { address: request.tokenAddress, block: blockNumber }),
      callTool("get_balance", { address: request.walletAddress, block: blockNumber }),
      callTool("eth_call", { transaction: { to: request.tokenAddress, data: ERC20_SELECTORS.decimals }, block: blockNumber }),
      callTool("eth_call", { transaction: { to: request.tokenAddress, data: encodeAddressCall(ERC20_SELECTORS.balanceOf, request.walletAddress) }, block: blockNumber }),
      callTool("get_gas_price"),
    ]);
    const bytecode = requireHex(code.code, "get_code");
    if (bytecode === "0x" || /^0x0*$/.test(bytecode)) throw new Error(`No contract bytecode found at ${request.tokenAddress} at block ${blockNumber}`);
    const tokenDecimalsBig = decodeUint(decimalsResult.result, "decimals()");
    if (tokenDecimalsBig > 255n) throw new Error("decimals() returned an invalid value");
    const tokenDecimals = Number(tokenDecimalsBig);
    const nativeBalanceWei = parseQuantity(balance.balanceWei ?? balance.balance ?? balance.result, "get_balance");
    const tokenBalanceRaw = decodeUint(tokenBalanceResult.result, "balanceOf()");
    const gasPriceWei = parseQuantity(gas.gasPriceWei ?? gas.gasPrice ?? gas.result, "get_gas_price");
    const decision = decideFromObservations({ blockNumber, nativeBalanceWei, tokenBalanceRaw, tokenDecimals, gasPriceWei, thresholds: request.thresholds });
    return {
      kind: "pharos-threshold-guardian",
      version: "0.1.0",
      source: { transport: "official-pharos-chain-mcp", endpoint: mcpUrl, readOnly: true },
      network: { name: chain.name ?? "Pharos", chainId: Number(chain.chainId), nativeSymbol: chain.nativeSymbol ?? "PROS" },
      snapshot: { pinnedBlock: blockNumber, gasPriceObservation: "current MCP get_gas_price; no block argument is supported" },
      target: { walletAddress: request.walletAddress, tokenAddress: request.tokenAddress },
      thresholds: Object.fromEntries(Object.entries(request.thresholds).map(([key, value]) => [key, value.toString()])),
      ...decision,
      trace: decision.conditions.map((item) => `${item.id}: ${item.actual} ${item.operator} ${item.threshold} = ${item.passed ? "PASS" : "FAIL"}`),
    };
  } finally {
    await mcpClose(mcpUrl, sessionId);
  }
}
