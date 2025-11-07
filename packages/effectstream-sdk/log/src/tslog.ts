import { SeverityNumber } from "@opentelemetry/api-logs";
import { type ILogObj, type IMeta, Logger } from "tslog";
import {
  defaultSeverity,
  type LogFunc,
  type Namespace,
  PaimaComponents,
  PaimaToolsComponents,
} from "./const.ts";
import { chainedMessage, Format, matchColor } from "material-chalk";
import chalk from "chalk";
import { toString } from "./utils.ts";
// TODO How to handle this in the frontend & backend?
const ENV = { NODE_ENV: 'development' } // TODO This should come from @effectstream/utils/node-env ENV

/**
 * https://github.com/fullstack-build/tslog/pull/308
 */
export enum DefaultLogLevels {
  SILLY = 0,
  TRACE = 1,
  DEBUG = 2,
  INFO = 3,
  WARN = 4,
  ERROR = 5,
  FATAL = 6,
}

export function mapSeverity(level: SeverityNumber): DefaultLogLevels {
  if (level === SeverityNumber.UNSPECIFIED) {
    return DefaultLogLevels.INFO;
  }
  if (level < SeverityNumber.DEBUG) {
    return DefaultLogLevels.TRACE;
  }
  if (level < SeverityNumber.INFO) {
    return DefaultLogLevels.DEBUG;
  }
  if (level < SeverityNumber.WARN) {
    return DefaultLogLevels.INFO;
  }
  if (level < SeverityNumber.ERROR) {
    return DefaultLogLevels.WARN;
  }
  if (level < SeverityNumber.FATAL) {
    return DefaultLogLevels.ERROR;
  }
  return DefaultLogLevels.FATAL;
}

const chalkFormat = Format.Chalk(chalk);
const logLevels = {
  SILLY: matchColor("#FFFFFF").formatAs(chalkFormat).dim,
  TRACE: matchColor("#FFFFFF").formatAs(chalkFormat).dim,
  DEBUG: matchColor("#00FF00").formatAs(chalkFormat).dim,
  INFO: matchColor("#0000FF").formatAs(chalkFormat).dim,
  WARN: matchColor("#FFFF00").formatAs(chalkFormat),
  ERROR: matchColor("#FF0000").formatAs(chalkFormat),
  FATAL: matchColor("#FF0000").formatAs(chalkFormat),
};

function padLeft(
  input: number | string,
  targetLength: number,
  padChar: string = "0",
): string {
  const str = input.toString();
  return str.padStart(targetLength, padChar);
}

const log: Logger<ILogObj> = new Logger({
  minLevel: mapSeverity(defaultSeverity),
  overwrite: {
    formatMeta: (meta?: IMeta) => {
      if (meta == null) return "";
      const timestamp = chalk.white.dim((() => {
        if (ENV.NODE_ENV !== "development") {
          return meta.date.toISOString();
        }
        // use a shorter timestamp locally so it takes less space on the console
        return `${padLeft(meta.date.getHours(), 2)}:${
          padLeft(meta.date.getMinutes(), 2)
        }:${padLeft(meta.date.getSeconds(), 2)}`;
      })());
      const logLevelName = logLevels
        [meta.logLevelName as keyof typeof logLevels](meta.logLevelName);
      return [timestamp, logLevelName].join(" ") + "\t";
    },
  },
});

export function attachTransport(callback: (logObj: ILogObj) => void) {
  log.attachTransport((logObj) => {
    callback(logObj);
  });
}

function getLogMethod(level: SeverityNumber) {
  if (level === SeverityNumber.UNSPECIFIED) {
    const level = mapSeverity(defaultSeverity);
    return log.log.bind(
      log,
      level,
      DefaultLogLevels[level],
    );
  }
  if (level < SeverityNumber.DEBUG) {
    return log.trace.bind(log);
  }
  if (level < SeverityNumber.INFO) {
    return log.debug.bind(log);
  }
  if (level < SeverityNumber.WARN) {
    return log.info.bind(log);
  }
  if (level < SeverityNumber.ERROR) {
    return log.warn.bind(log);
  }
  if (level < SeverityNumber.FATAL) {
    return log.error.bind(log);
  }
  return log.fatal.bind(log);
}

export type TslogLogFunc = LogFunc;

const formatMessage = (
  namespaces: Namespace,
  ...data: unknown[]
): string => {
  return chainedMessage(
    chalk,
    namespaces,
    ...data.map(toString),
  );
};


const namespaces = (component: string, namespace: Namespace) => {
  const subNamespaces = Array.isArray(namespace) ? namespace : [namespace];
  if (
    Object.values(PaimaComponents).includes(component as any) ||
    Object.values(PaimaToolsComponents).includes(component as any)
  ) {
    return ["effectstream", component, ...subNamespaces];
  }
  return [component, ...subNamespaces];
};

export const tsLogFormatted: TslogLogFunc = (
  component,
  namespace,
  level,
  doLog,
): void => {
  doLog((...data: unknown[]) =>
    getLogMethod(level)(
      formatMessage(namespaces(component, namespace), ...data),
    )
  );
};

export const tsLogOrchestrator: TslogLogFunc = (
  component,
  namespace,
  level,
  doLog,
): void => {
  doLog((...data: unknown[]) =>
      console.log(JSON.stringify({
        "__ORCHESTRATOR__": true,
        data,
        namespaces: namespaces(component, namespace),
        level,
        date: new Date().getTime(),
      }, 
      (_, v) => typeof v === "bigint" ? v.toString() : v
    ))
  )
};

export const tsLogGetFormattedMessage = (
  component: string,
  namespace: Namespace,
  level: SeverityNumber,
  doLog: any,
): string => {
  let val = "";
  doLog((...data: unknown[]) => {
    val = formatMessage(namespaces(component, namespace), ...data);
  });
  return val;
};
