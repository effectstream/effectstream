# @effectstream/log

OpenTelemetry-instrumented structured logging for EffectStream. Wraps
`tslog` and the OpenTelemetry SDK behind a single `log` object that emits
both pretty console output (`log.local`) and OTLP traces/logs to your
collector (`log.remote`).

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

// Initialize OpenTelemetry once at startup (optional — defaults work too).
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
entirely when the level is filtered out — handy when log arguments are
expensive to format (`JSON.stringify` of a big object).

For Effection-based code, use `setupOtel` as a generator so OTel context
flows through your coroutines:

```typescript
import { main } from "effection";
import { setupOtel } from "@effectstream/log";

main(function* () {
  yield* setupOtel({ serviceName: "my-app" });
  // your effection-based code…
});
```

Point the SDK at any OTLP-compatible collector (Grafana Alloy, Tempo,
Honeycomb, …) via the standard `OTEL_EXPORTER_OTLP_ENDPOINT` env var.

## Inside EffectStream

Every package in the framework — sync, runtime, batcher, sm — logs through
this module so the whole node emits one consistent trace tree. The
`ComponentNames` constants tag log records by component, which is what
powers the orchestrator's per-component log views.

## Key exports

- `log.local(component, namespace, level, deferred)` — console-only logging. `level` is `SeverityNumber`; `deferred = (l) => l(...args)` is called only if the level passes the filter.
- `log.localForce(...)` — bypasses level filtering.
- `log.remote(...)` — console + OpenTelemetry log record. Same signature as `local`.
- `log.remoteForce(...)` — `remote` without level filtering.
- `log.formatMessage(...)` — the formatter used internally; useful for custom transports.
- `defaultOtelSetup(opts)` — one-call OpenTelemetry SDK setup with sensible defaults.
- `setupOtel(opts)` — Effection-generator variant of the same.
- `attachTransport(transport)` — register a custom tslog transport (e.g. ship logs to a file).
- `SeverityNumber` — re-export of OpenTelemetry severity levels.
- `ComponentNames` / `LaunchableComponents` — string-enum constants used to tag logs by component.
- `Namespace` — `string | string[]` for log namespacing.

## Examples

Runnable: [`test/examples.test.ts`](./test/examples.test.ts).

## Links

- Docs: https://effectstream.github.io/docs/packages/sdk/log
- Source: https://github.com/PaimaStudios/paima-engine/tree/main/packages/effectstream-sdk/log
