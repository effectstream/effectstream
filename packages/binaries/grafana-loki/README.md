# @effectstream/grafana-loki

NPM wrapper around [Grafana Loki](https://grafana.com/oss/loki/) — the
log-aggregation backend EffectStream nodes ship structured logs to in
local development. Installs a pinned binary into
`node_modules/.bin/grafana-loki`.

- Pinned Grafana Loki binary, the local log backend for `@effectstream/log` output.
- One-command start via `bunx grafana-loki -config.file=loki.yaml`.
- Pairs with `@effectstream/grafana-alloy` so traces and logs land in one place.
- Component-tagged logs queryable from a local Grafana out of the box.

## Install

```bash
bun add @effectstream/grafana-loki
# or
npm install @effectstream/grafana-loki
```

## Standalone usage

```bash
# Start Loki with a config file
bunx grafana-loki -config.file=loki.yaml

# Or invoke through this package
bun run --bun @effectstream/grafana-loki/start
```

The package downloads the pinned tarball for your OS/arch on install.

## Inside EffectStream

The orchestrator's observability step pairs this with
`@effectstream/grafana-alloy` so logs emitted via `@effectstream/log`
land in Loki, queryable from a local Grafana. Out of the box you get
component-tagged (`ComponentNames`) logs without writing any collector
config.

## Links

- Docs: https://effectstream.github.io/docs/packages/binaries/grafana-loki
- Source: https://github.com/PaimaStudios/paima-engine/tree/main/packages/binaries/grafana-loki
- Upstream Grafana Loki: https://grafana.com/oss/loki/
