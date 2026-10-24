---
name: pharos-threshold-guardian
description: Evaluate configurable native balance, ERC-20 balance, and gas thresholds through official Pharos Chain MCP before any downstream action.
version: 0.1.0
---

# Pharos Threshold Guardian

## Safety boundary

Read-only gate. Never sign, broadcast, or request a private key. A `FIRE`
decision is permission for a caller to prepare its own next step, not permission
to execute a transaction.

## Input

Provide:

- wallet EVM address;
- deployed ERC-20 address;
- `minNativeWei` decimal integer;
- `minTokenRaw` decimal integer;
- `maxGasPriceWei` decimal integer.

## Procedure

1. Validate addresses and policy fields.
2. Initialize `https://mcp.pharos.xyz/mcp`; require chain ID `1672`.
3. Pin latest block once.
4. At that block, read wallet native balance, target bytecode, ERC-20 decimals,
   and `balanceOf(wallet)`.
5. Read current gas price. Mark it current, not pinned: tool has no block input.
6. Emit three traces, each with observed value, comparator, threshold, and
   pass/fail.
7. Return `FIRE` only if every trace passes. Otherwise return `HOLD`.

## Output requirement

Include MCP endpoint, chain ID, pinned block, input policy, raw exact integer
observations, and final decision. Do not use JavaScript `Number` for quantities.
