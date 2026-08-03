# @effectstream/grafana-loki

NPM wrapper around [Grafana Loki](https://grafana.com/oss/loki/) - the
log-aggregation backend EffectStream nodes ship structured logs to in
local development. Installs a pinned binary into
`node_modules/.bin/grafana-loki`.

- Pinned Grafana Loki binary (3.5.8), the local log backend for `@effectstream/log` output.
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

## Integrity

`bin-wrapper` has no checksum support and discards the archive after extracting,
so this package hashes the **extracted `loki`** and refuses to run anything
that is not one of the pinned v3.5.8 builds. Set `GRAFANA_LOKI_SKIP_CHECKSUM=1` to bypass when
deliberately running a local build.

Digests live in `checksums.js` and the check is `@effectstream/binary-checksum`,
shared with the other verified wrappers. Every entry is **upstream-verified**:
the archive each digest came from was matched against the checksum the vendor
publishes before the binary inside it was hashed, so the digest traces back to
something the vendor stands behind rather than to whatever a download happened to
return.

Regenerate after a version bump:

```bash
bun scripts/generate-binary-checksums.ts grafana-loki
```

## Links

- Docs: https://effectstream.github.io/docs/packages/binaries/grafana-loki
- Source: https://github.com/effectstream/effectstream/tree/main/packages/binaries/grafana-loki
- Upstream Grafana Loki: https://grafana.com/oss/loki/
