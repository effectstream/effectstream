import { SeverityNumber } from "@opentelemetry/api-logs";
import { tsLogFormatted, tsLogGetFormattedMessage, tsLogOrchestrator, type TslogLogFunc } from "./tslog.ts";
import { otelLog, type OtelLogFunc } from "./otel/logger.ts";
import "./brands.ts"; // register material-chalk brands
import { getEnv } from "@effectstream/utils/runtime";
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

const orchestratorEnv = getEnv("EFFECTSTREAM_ORCHESTRATOR");
const localLogger = orchestratorEnv ? tsLogOrchestrator : tsLogFormatted;
const remoteLogger = orchestratorEnv ? tsLogOrchestrator : otelLog;

export const log: {
  local: TslogLogFunc;
  localForce: TslogLogFunc;
  remote: TslogLogFunc;
  remoteForce: OtelLogFunc;
  formatMessage: typeof tsLogGetFormattedMessage
} = {
  local: localLogger,
  remote: remoteLogger,
  localForce: tsLogFormatted,
  remoteForce: otelLog,
  formatMessage: tsLogGetFormattedMessage,
};
