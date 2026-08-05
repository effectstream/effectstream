---
title: "@effectstream/log"
description: "OpenTelemetry observability for EffectStream"
sidebar_label: "log"
---

<!-- Generated from packages/effectstream-sdk/log/README.md by docs/site/scripts/sync-package-readmes.ts. Do not edit directly. -->

> Package: **[`@effectstream/log`](https://www.npmjs.com/package/@effectstream/log)** · [Source](https://github.com/effectstream/effectstream/tree/main/packages/effectstream-sdk/log)

OpenTelemetry-instrumented structured logging for EffectStream. Wraps
`tslog` and the OpenTelemetry SDK behind a single `log` object that emits
both pretty console output (`log.local`) and OTLP traces/logs to your
collector (`log.remote`).

- OpenTelemetry-instrumented structured logging on top of `tslog`.
- Pretty console output and OTLP traces / logs from one `log` object.
- Used by every package in the framework so the node emits one trace tree.
- `ComponentNames` constants tag log records by component, powering per-component log views.

## Install

```bash
bun add @effectstream/log
# or
npm install @effectstream/log
```

## Standalone usage

Any Node service that wants colored terminal logs plus OTLP export with one
dependency.

```typescript
import {
  ComponentNames,
  defaultOtelSetup,
  log,
  SeverityNumber,
} from "@effectstream/log";

// Initialize OpenTelemetry once at startup (optional - defaults work too).
defaultOtelSetup({ serviceName: "my-app" });

// Local-only: pretty console output, no OTLP.
log.local(
  "my-app",                  // component name (any string)
  "startup",                 // namespace
  SeverityNumber.INFO,
  (l) => l("started on port", 3000),
);

// Remote: console + OpenTelemetry log record + trace correlation.
log.remote(
  "my-app",
  "auth",
  SeverityNumber.INFO,
  (l) => l("user logged in", { userId: "u_123" }),
);
```

The deferred `(l) => l(...)` form means message construction is skipped
entirely when the level is filtered out - handy when log arguments are
expensive to format (`JSON.stringify` of a big object).

Point the SDK at any OTLP-compatible collector (Grafana Alloy, Tempo,
Honeycomb, …) via the standard `OTEL_EXPORTER_OTLP_ENDPOINT` env var.

## Inside EffectStream

Every package in the framework - sync, runtime, batcher, sm - logs through
this module so the whole node emits one consistent trace tree. The
`ComponentNames` constants tag log records by component, which is what
powers the orchestrator's per-component log views.

## Key exports

- `log.local(component, namespace, level, deferred)`: console-only logging. `level` is `SeverityNumber`; `deferred = (l) => l(...args)` is called only if the level passes the filter.
- `log.localForce(...)` bypasses level filtering.
- `log.remote(...)`: console + OpenTelemetry log record. Same signature as `local`.
- `log.remoteForce(...)` is `remote` without level filtering.
- `log.formatMessage(...)` - the formatter used internally; useful for custom transports.
- `defaultOtelSetup(name, version)`: one-call OpenTelemetry SDK setup with sensible defaults. Takes two positional strings, not an options object.
- `attachTransport(transport)` registers a custom tslog transport (e.g. ship logs to a file).
- `SeverityNumber`: re-export of OpenTelemetry severity levels.
- `ComponentNames`: string-enum constants used to tag logs by component.
- `LaunchableComponents`: the subset of `ComponentNames` the orchestrator can launch (`ComponentNames` is this plus the secondary components).
- `Namespace`: `string | string[]` for log namespacing.

## Environment variables

Two variables change this package's behaviour:

| Name | Effect |
| --- | --- |
| `EFFECTSTREAM_LOG_LEVEL` | Minimum severity to emit, matched case-insensitively against the OpenTelemetry `SeverityNumber` names (`TRACE`, `DEBUG`, `INFO`, `WARN`, `ERROR`, `FATAL`). Defaults to `INFO`; an unrecognised value falls back to `INFO` rather than erroring. |
| `EFFECTSTREAM_ORCHESTRATOR` | Set by the orchestrator when it launches a process. When present, both the local and remote loggers switch to the orchestrator's structured transport so the TUI can group output per component, instead of writing formatted lines and OpenTelemetry records. |

## Examples

Runnable: [`test/examples.test.ts`](https://github.com/effectstream/effectstream/blob/main/packages/effectstream-sdk/log/test/examples.test.ts).

## Links

- Docs: https://effectstream.github.io/docs/packages/sdk/log
- Source: https://github.com/effectstream/effectstream/tree/main/packages/effectstream-sdk/log
