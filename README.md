# Pharos Threshold Guardian

Read-only, configurable execution gate for the **Threshold Guardian** task in
Pharos Agent Arena.

It reads three independent on-chain conditions through the official Pharos
Chain MCP and returns a decision before any downstream action can be prepared:

1. wallet native PROS balance is at least `minNativeWei`;
2. wallet ERC-20 balance is at least `minTokenRaw`;
3. current gas price is at most `maxGasPriceWei`.

The outcome is `FIRE` only if every condition passes. Otherwise it is `HOLD`.
No wallet connection, private key, transaction signing, direct JSON-RPC client,
or write call exists in this project.

## Proof properties

- Transport: `https://mcp.pharos.xyz/mcp`
- Network: Pharos Pacific Mainnet, chain ID `1672`
- Native and ERC-20 balance calls use one pinned block.
- Gas is explicitly labeled as a current observation because the official
  `get_gas_price` MCP tool has no block argument.
- Output contains a condition-by-condition decision trace with observed value,
  threshold, comparator, unit, and pass/fail.

## Run locally

```bash
npm ci
npm run check
npm test
npx wrangler pages dev public
```

Open the local URL and evaluate once with permissive thresholds to show `FIRE`,
then set `minNativeWei` above the returned native balance or set
`maxGasPriceWei` below the returned gas price to show `HOLD`.

## API

`POST /api/evaluate`

```json
{
  "walletAddress": "0x2e1c3e80d13b03aac05aeefacc254e26d6fafb51",
  "tokenAddress": "0x6b0a44c64190279f7034b77c13a566e914fe5ec4",
  "thresholds": {
    "minNativeWei": "0",
    "minTokenRaw": "0",
    "maxGasPriceWei": "100000000000"
  }
}
```

All threshold amounts are decimal integer strings. Token thresholds are raw
smallest units, deliberately avoiding floating-point conversion.

## Deployment

Cloudflare Pages Functions serves `functions/api/evaluate.js` and static demo
lives in `public/`:

```bash
npx wrangler pages deploy public --project-name pharos-threshold-guardian
```

Then bind the custom domain in Cloudflare Pages (Custom domains) under the
`nampharos.web.id` zone. Use that URL as the Agent Arena proof link. The
reviewer can reproduce both outcomes by changing only policy fields.

### Production notes

- `functions/api/evaluate.js` accepts same-origin requests plus any
  `https://*.nampharos.web.id` origin. Change `ALLOWED_ORIGIN` if you deploy
  under another domain.
- Each evaluation makes about 8 calls to the public Pharos MCP. Add a
  Cloudflare rate-limiting rule on `POST /api/evaluate` (for example 10
  requests per minute per IP) to protect that upstream.
- Default `maxGasPriceWei` in the demo is 100 gwei so it does not sit exactly
  on the current gas price. The sample wallet holds 0 of the sample token, so
  the token condition only passes with `minTokenRaw` of `0`.
