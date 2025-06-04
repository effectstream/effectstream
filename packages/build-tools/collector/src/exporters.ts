import { addData } from "./system-exporters/api-stream.ts";
import { log as logger, type Namespace, type SeverityNumber } from "@paima/log";

// This file defines the exporters pipelines used by the collector to export the data.
export type ExportData = {
  component: string;
  namespace: Namespace;
  level: SeverityNumber;
  message: string[];
};

const exporters: {
  name: string;
  push: (data: ExportData) => void;
}[] = [
  {
    name: "api-stream",
    push: addData,
  },
  {
    name: "paima-log",
    push: (data: {
      component: string;
      namespace: Namespace;
      level: SeverityNumber;
      message: string[];
    }) => {
      logger.local(
        data.component,
        data.namespace,
        data.level,
        (log) => log(data.message),
      );
    },
  },
];

export function exportData(data: ExportData) {
  exporters.forEach((exporter) => {
    exporter.push(data);
  });
}
