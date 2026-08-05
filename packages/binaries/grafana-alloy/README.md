# @effectstream/grafana-alloy

NPM wrapper around [Grafana Alloy](https://grafana.com/oss/alloy/) - the
OpenTelemetry-compatible collector EffectStream nodes ship traces, logs,
and metrics to during local development. Installs a pinned binary into
`node_modules/.bin/grafana-alloy`.

- Pinned Grafana Alloy binary (1.11.3), the OTel collector Effectstream nodes ship to in local dev.
- One-command start via `bunx grafana-alloy run config.alloy`.
- Pairs with `@effectstream/grafana-loki` for logs.
- Drop-in: point your own collector at the same OTLP endpoint in production.

## Install

```bash
bun add @effectstream/grafana-alloy
# or
npm install @effectstream/grafana-alloy
```

## Standalone usage

```bash
# Start Alloy with a config file
bunx grafana-alloy run config.alloy

# Or invoke through this package
bun run --bun @effectstream/grafana-alloy/start
```

The package downloads the pinned tarball for your OS/arch on install.

## Inside EffectStream

`@effectstream/log` emits OTLP. In local dev the orchestrator's
observability step boots `grafana-alloy` plus `grafana-loki` so traces
and logs from every component show up in one place. Point your own
collector at the same OTLP endpoint to ship to Tempo / Honeycomb / etc.
in production.

## Integrity

`bin-wrapper` has no checksum support and discards the archive after extracting,
so this package hashes the **extracted `alloy`** and refuses to run anything
that is not one of the pinned v1.11.3 builds. Set `GRAFANA_ALLOY_SKIP_CHECKSUM=1` to bypass when
deliberately running a local build.

Digests live in `checksums.js` and the check is `@effectstream/binary-checksum`,
shared with the other verified wrappers. Every entry is **upstream-verified**:
the archive each digest came from was matched against the checksum the vendor
publishes before the binary inside it was hashed, so the digest traces back to
something the vendor stands behind rather than to whatever a download happened to
return.

Regenerate after a version bump:

```bash
bun scripts/generate-binary-checksums.ts grafana-alloy
```

## Links

- Docs: https://effectstream.github.io/docs/packages/binaries/grafana-alloy
- Source: https://github.com/effectstream/effectstream/tree/main/packages/binaries/grafana-alloy
- Upstream Grafana Alloy: https://grafana.com/oss/alloy/
