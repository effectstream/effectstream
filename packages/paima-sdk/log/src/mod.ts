import { SeverityNumber } from "@opentelemetry/api-logs";
import { tslogLog, type TslogLogFunc } from "./tslog.ts";
import { otelLog, type OtelLogFunc } from "./otel/logger.ts";
import "./brands.ts"; // register material-chalk brands
export * from "./otel/setup.ts";
export { ComponentNames, type Namespace } from "./const.ts";
export { attachTransport } from "./tslog.ts";
export { DefaultLogLevels } from "./tslog.ts";

// re-exporting this
// so that we don't need to re-import opentelemetry in every component
export { SeverityNumber };

export const log: {
  local: TslogLogFunc;
  remote: OtelLogFunc;
} = {
  local: tslogLog,
  remote: otelLog,
};
