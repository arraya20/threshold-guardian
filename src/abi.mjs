export class InputError extends Error {
  constructor(message) {
    super(message);
    this.name = "InputError";
  }
}

export const MCP_URL = "https://mcp.pharos.xyz/mcp";
export const PHAROS_CHAIN_ID = 1672;

export const ERC20_SELECTORS = Object.freeze({
  decimals: "0x313ce567",
  balanceOf: "0x70a08231",
});

export function requireAddress(value, label = "address") {
  if (typeof value !== "string" || !/^0x[0-9a-fA-F]{40}$/.test(value)) {
    throw new InputError(`Invalid ${label}: ${value ?? "missing"}`);
  }
  return value.toLowerCase();
}

export function requireDecimal(value, label, { min = 0n } = {}) {
  if (typeof value !== "string" && typeof value !== "number") throw new InputError(`${label} must be a decimal string`);
  const text = String(value);
  if (!/^\d+$/.test(text)) throw new InputError(`${label} must be a non-negative decimal integer`);
  const parsed = BigInt(text);
  if (parsed < min) throw new InputError(`${label} is below its minimum`);
  return parsed;
}

export function requireHex(value, label) {
  if (typeof value !== "string" || !/^0x[0-9a-fA-F]*$/.test(value)) throw new Error(`${label} returned invalid hex data`);
  return value;
}

export function decodeUint(value, label) {
  const hex = requireHex(value, label).slice(2);
  if (hex.length < 64 || hex.length % 2 !== 0) throw new Error(`${label} returned malformed ABI data`);
  return BigInt(`0x${hex.slice(0, 64)}`);
}

export function encodeAddressCall(selector, address) {
  requireAddress(address, "wallet address");
  return `${selector}${address.slice(2).toLowerCase().padStart(64, "0")}`;
}

export function formatUnits(value, decimals) {
  const amount = BigInt(value);
  const base = 10n ** BigInt(decimals);
  const whole = amount / base;
  const fraction = (amount % base).toString().padStart(decimals, "0").replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : whole.toString();
}
