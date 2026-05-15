# @effectstream/grafana-alloy

NPM wrapper around [Grafana Alloy](https://grafana.com/oss/alloy/) — the
OpenTelemetry-compatible collector EffectStream nodes ship traces, logs,
and metrics to during local development. Installs a pinned binary into
`node_modules/.bin/grafana-alloy`.

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

## Links

- Docs: https://effectstream.github.io/docs/packages/binaries/grafana-alloy
- Source: https://github.com/PaimaStudios/paima-engine/tree/main/packages/binaries/grafana-alloy
- Upstream Grafana Alloy: https://grafana.com/oss/alloy/
