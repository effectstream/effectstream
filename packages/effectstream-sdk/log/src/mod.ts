import { SeverityNumber } from "@opentelemetry/api-logs";
import { tslogLog, type TslogLogFunc } from "./tslog.ts";
import { otelLog, type OtelLogFunc } from "./otel/logger.ts";
import "./brands.ts"; // register material-chalk brands
export * from "./otel/setup.ts";
export {
  ComponentNames,
  LaunchableComponents,
  type Namespace,
} from "./const.ts";
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
  // TODO This is for effectstream-sync that write directly to the otel.
  //      When trying to run directly in the terminal the logs are lost.
  remote: Deno && Deno.env.get("PAIMA_LOGS_FORCE_STDOUT") ? tslogLog : otelLog,
};
