# wallets-ui — `@effectstream/wallets` browser smoke

A minimal vite + React page that imports `@effectstream/wallets` and renders
its exported `WalletMode` entries plus any injected wallets detected in the
browser. Served at http://localhost:4201.

## What this actually tests

One thing: **does `@effectstream/wallets` (and its transitive browser deps)
bundle and load in a real browser.** When we migrate the wallets SDK, bump
polkadot/midnight versions, or touch `@effectstream/concise`/`crypto`/
`config`/`utils`, a regression often surfaces here as a build failure or
a runtime `ReferenceError` / `null is not an object` during module load.

That's the entire value proposition. No wallet flow is automated — see
the manual matrix below.

## Automated: build + start smoke

`run-tests.ts` is wired into the `wallets` suite in `e2e/runner.ts`.
It:

1. `bun run build` — vite bundles the client.
2. `bun run server:start` — fastify serves `client/dist`.
3. `GET http://localhost:4201/` → expects HTTP 200 with a React root shell.

Skip the suite with `DISABLE_WALLETS=1`.

## Manual dev / inspection

```bash
cd e2e/wallets-ui
bun run dev          # vite dev server on :4201, auto-open browser
```

Open DevTools. If the page text renders *and* the console has no uncaught
errors, the SDK is healthy. Install a wallet extension (MetaMask, Lace,
Talisman, Pera, Auro, Nami…) and reload — the page will list anything it
detects under "Injected wallets".

## Manual test matrix (full wallet flows)

The previous `e2e/e2e-wallets/` app let testers exercise full sign /
submit flows against every connector. Rather than port that app and its
`config-localhost` surface (which pulled in Node-only fs/DB code), those
flows stay **manual** against the running e2e infrastructure:

| Mode | Required extension / tool | Network / env | Flow to verify |
|---|---|---|---|
| `EvmInjected` | MetaMask or Rabby | local hardhat (chain 31337) | connect → sign message |
| `EvmEthers` | — (built-in private-key signer) | local hardhat | pick primitive → submit via batcher |
| `Midnight` | [Lace](https://chromewebstore.google.com/detail/lace/gafhhkghbfjjkeiendhlofajokpaflmk) | Midnight `undeployed` | connect → mint via batcher |
| `Cardano` | Nami or Lace | Yaci DevKit local | connect → sign |
| `Polkadot` | Talisman or PolkadotJS extension | any Substrate chain | connect → sign (sr25519) |
| `Algorand` | Pera Wallet | — | connect → sign message |
| `Mina` | Auro | — | connect → sign message |
| `Avail` | Talisman or PolkadotJS extension | Avail testnet | connect → submit data |

To exercise any of these, spin the relevant chain infra manually (see the
per-chain launchers under `e2e/*/launcher.cli.ts`) and connect to it
from a client app that consumes `@effectstream/wallets` — this smoke page
intentionally doesn't wire up chain-specific config.

## Why not Playwright?

The things worth testing (real extension sign dialogs, injected provider
behavior across real wallets) can't be faked without per-extension mocks
or Synpress-style MetaMask rigs. That's weeks of per-wallet fiddly setup
that breaks on extension updates and doesn't test the extensions users
actually install. Build-time + module-load validation is the cheap,
high-signal automation; extension flows stay manual.
