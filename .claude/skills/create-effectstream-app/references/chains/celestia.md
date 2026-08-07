# Celestia

`packages/contracts-celestia/` — Celestia DA layer config + bridge funding. The `launchCelestia` helper handles the four-process boot chain.

> **See also (concept docs).**
> - Celestia chain overview: `docs/site/docs/home/200-chains/209-celestia.md`
> - Per-binary: `docs/site/docs/home/500-packages/540-binaries/celestia.md`

## Tools (probe before scaffolding)

(no extra system tools — `bun` is enough; the Celestia consensus node and bridge are vendored through `@effectstream/npm-celestia-*` and extracted on first run)

## Local dev environment

`launchCelestia` starts a four-process chain:

1. `celestia-clean` — wipes stale `CELESTIA_HOME` data
2. `celestia-devnet` — Celestia consensus node + bridge (ports 26657 / 26658)
3. `celestia-bridge-wait` — waits for the bridge RPC to be ready
4. `celestia-fund-bridge` — funds the bridge node wallet

`CelestiaNames` exports the names: `CLEAN`, `DEVNET`, `BRIDGE_WAIT`, `FUND`. The sync node should `dependsOn: CelestiaNames.FUND` to start only after the bridge is funded.

## Required `launchCelestia` package scripts

(Verified against `packages/build-tools/orchestrator/scripts/launch-celestia.ts`.)

- `celestia-bridge:start` — start the consensus node + bridge
- `celestia-bridge:wait` — wait for bridge RPC (port 26658)
- `celestia-fund:bridge` — fund the bridge wallet

## Sync protocol + primitives

Sync protocol: `CELESTIA_PARALLEL`.

| Primitive | Grammar | Use |
|---|---|---|
| `PrimitiveTypeCelestiaGeneric` | `builtinGrammars.celestiaGeneric` | Blob data events |

## Batcher adapters

| Adapter | Notes |
|---|---|
| `CelestiaAdapter` | Submits PayForBlob (PFB) txs via the bridge JSON-RPC |

## Orchestrator wiring

```ts
import { launchCelestia, CelestiaNames } from "@effectstream/orchestrator/launch-celestia";

const root = import.meta.dirname!;

export default {
  processes: [
    ...launchPglite(),
    ...launchCelestia(
      "@my-template/contracts-celestia",
      { cwd: path.join(root, "packages/contracts-celestia") },
      // optional: { ports: [26657, 26658], home: "/tmp/my-template-celestia-home" }
    ),
    {
      name: "sync",
      args: ["run", "packages/node/main.dev.ts"],
      waitToExit: false,
      type: "system-dependency",
      env: { PGLITE: "true" },
      dependsOn: [DbNames.PGLITE_WAIT, CelestiaNames.FUND],
    },
  ],
} satisfies OrchestratorConfig;
```

For multiple Celestia instances side by side (e.g. one in dev mode, another in test mode), pass distinct `home` paths through `opts.home` so the chains don't share `CELESTIA_HOME`.

## Sharp edges

### Built-in primitive only threads `suppliedValue` into `parsedInput`

`PrimitiveTypeCelestiaGeneric` puts the blob's raw bytes (as a binary string, `atob(blob.data)`) into `data.parsedInput.suppliedValue` — but the other interesting fields (`namespace`, `commitment`, `blobIndex`) live in the primitive's `accountingPayload` and are NOT exposed to the STM. Templates needing those columns must either:
- Store the configured namespace as an invariant column (it's per-primitive-instance, so safe to hard-code in the row);
- Subclass `CelestiaGenericPrimitive` and override `getPayload()` to thread the extra fields into the STM input.

Convert `suppliedValue` to hex via `Buffer.from(suppliedValue, "binary").toString("hex")` for storage.

### Celestia sync uses long polling — bump test timeouts

`CELESTIA_PARALLEL` typically uses `delayMs: 12_000` + `pollingInterval: 6_000`. Phase B's typed-query `assertEventually` should use ~240s timeout (4 minutes). Default test timeouts built for EVM (~20s) will fail well before the engine indexes the blob.

### Cold-start binary download

On a fresh checkout the first `bun run dev` takes ~60-90s because `@effectstream/npm-celestia-*` downloads `celestia-appd` and `celestia-node` from GitHub. Subsequent runs are ~10s. The `celestia-bridge-wait` step needs at least a 300s timeout to accommodate the cold case.

### `blob.Submit` JSON-RPC shape (for tests / batchers)

Params is `[[blobObj], txConfig]`:

```ts
const blobObj = { namespace, data, share_version: 0 };
const txConfig = { fee: 2000, gasLimit: 100000 };  // devnet values
```

Namespace is base64-encoded 29 bytes: 1 version byte `0x00` + 28-byte ID, right-aligned. The canonical encoding helper is the exported `celestiaNamespaceToBase64` function in `packages/node-sdk/sync/src/sync-protocols/celestia/CelestiaClient.ts` (the batcher adapter keeps its own private copy). Lifting that snippet into the Phase B test is the simplest path.

## Frontend / wallet integration

Celestia is a DA layer — no browser-wallet integration is needed for typical templates. The frontend usually just polls the engine's GET API to surface indexed blobs.
