import * as otlApi from "@opentelemetry/api-logs";
import type { LogFunc } from "../const.ts";
import { defaultSeverity } from "../const.ts";
import { toString } from "../utils.ts";

export type OtelLogFunc = LogFunc;

export const otelLog: OtelLogFunc = (
  component,
  namespace,
  level,
  doLog,
): void => {
  if (level < defaultSeverity) return;
  // note: we can't just use otel span events, or debugging gets really hard
  //       since span events only get sent to the collector after the span completed.
  //       there are some open questions about logs/span/events too, so we just don't use span events for now
  //       See https://github.com/open-telemetry/opentelemetry-specification/discussions/3732

  // TODO: modify these constants
  const logger = otlApi.logs.getLogger(component, "0.3.0");
  doLog((...data: unknown[]) => {
    return logger.emit({
      severityNumber: level,
      body: data.map(toString).join(" "),
      attributes: {
        component,
        namespace: Array.isArray(namespace) ? namespace.join(".") : namespace,
      },
    })
  });
};
