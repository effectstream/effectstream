# Celestia

`packages/contracts-celestia/` — Celestia DA layer config + bridge funding. No smart contracts and no dedicated `launchCelestia` helper; the node is expected to run externally.

> **See also (concept docs).**
> - Celestia chain overview: `docs/site/docs/home/200-chains/209-celestia.md`
> - Per-binary: `docs/site/docs/home/500-packages/540-binaries/celestia.md`

## Tools (probe before scaffolding)

(no extra system tools — `bun` is enough; the Celestia node itself is expected to be provided externally)

## Local dev environment

There is no `launchCelestia` helper. Bring the Celestia node up however suits the user (Docker Compose alongside the orchestrator, hosted node, etc.) and point the sync protocol at it. If a local node is needed inside the orchestrator, write a custom `ProcessConfig` entry — but most templates target a remote/shared node.

## Required `launchCelestia` package scripts

n/a — no launcher.

## Sync protocol + primitives

Sync protocol: `CELESTIA_PARALLEL`.

| Primitive | Grammar | Use |
|---|---|---|
| `PrimitiveTypeCelestiaGeneric` | `builtinGrammars.celestiaGeneric` | Blob data events |

## Batcher adapters

(none — interact with Celestia directly; the batcher pattern doesn't apply to DA-layer writes)

## Orchestrator wiring

Since there's no launcher, add a custom process pointing at the external node:

```ts
{
  name: "celestia-wait",
  description: "Wait for the external Celestia node to respond",
  args: ["./scripts/wait-for-celestia.ts"],
  waitToExit: true,
  type: "system-dependency",
},
{
  name: "sync",
  // ...
  dependsOn: [DbNames.PGLITE_WAIT, "celestia-wait"],
},
```

## Sharp edges

### Built-in primitive only threads `suppliedValue` into `parsedInput`

`PrimitiveTypeCelestiaGeneric` puts the blob's raw bytes (as a binary string, `atob(blob.data)`) into `data.parsedInput.suppliedValue` — but the other interesting fields (`namespace`, `commitment`, `blobIndex`) live in the primitive's `accountingPayload` and are NOT exposed to the STM. Templates needing those columns must either:
- Store the configured namespace as an invariant column (it's per-primitive-instance, so safe to hard-code in the row);
- Subclass `CelestiaGenericPrimitive` and override `getPayload()` to thread the extra fields into the STM input.

Convert `suppliedValue` to hex via `Buffer.from(suppliedValue, "binary").toString("hex")` for storage.

### Celestia sync uses long polling — bump test timeouts

`CELESTIA_PARALLEL` typically uses `delayMs: 12_000` + `pollingInterval: 6_000`. Phase B's `assertSQL` should use ~240s timeout (4 minutes). Default test timeouts built for EVM (~20s) will fail well before the engine indexes the blob.

### Cold-start binary download

On a fresh checkout the first `bun run dev` takes ~60-90s because `@effectstream/npm-celestia-*` downloads `celestia-appd` and `celestia-node` from GitHub. Subsequent runs are ~10s. The `celestia-bridge-wait` step needs at least a 300s timeout to accommodate the cold case.

### `blob.Submit` JSON-RPC shape (for tests / batchers)

Params is `[[blobObj], txConfig]`:

```ts
const blobObj = { namespace, data, share_version: 0 };
const txConfig = { fee: 2000, gasLimit: 100000 };  // devnet values
```

Namespace is base64-encoded 29 bytes: 1 version byte `0x00` + 28-byte ID, right-aligned. The canonical encoding helper is `CelestiaClient.celestiaNamespaceToBase64` in `packages/batcher/adapters/celestia-adapter.ts`. Lifting that snippet into the Phase B test is the simplest path.

## Frontend / wallet integration

n/a — Celestia DA isn't wallet-driven. Interact with the engine's GET API only.
