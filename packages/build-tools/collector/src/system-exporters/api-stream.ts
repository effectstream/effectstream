import type { Namespace, SeverityNumber } from "@paima/log";
import { fastify, type FastifyInstance } from "fastify";

export interface TsLogExported {
  "0": string;
  _meta: Meta;
}

export interface Meta {
  runtime: string;
  runtimeVersion: string;
  hostname: string;
  date: Date;
  logLevelId: number;
  logLevelName: string;
  path: Path;
}

export interface Path {
  fullFilePath: string;
  fileName: string;
  fileNameWithLine: string;
  fileColumn: string;
  fileLine: string;
  filePath: string;
  filePathWithLine: string;
}

//
// This exporter exposes the lastest 1000 logs.
//
// Each time it's read, it clears the data store.
// This is useful for the TUI to display the latest logs.
//
const MAX_DATA_ITEMS = 1000;

const dataStore: TsLogExported[] = [];

export function addData(item: TsLogExported) {
  dataStore.push(item);
  // Keep only the latest 1000 items
  if (dataStore.length > MAX_DATA_ITEMS) {
    dataStore.splice(0, dataStore.length - MAX_DATA_ITEMS);
  }
}

function getData() {
  const copy = [...dataStore];
  dataStore.length = 0;
  return copy;
}

const PORT = 11033;
const server = fastify();

server.get("/v1/data", async (request: any, reply: any) => {
  const copy = getData();
  reply.status(200).send(copy);
});

try {
  await server.listen({ port: PORT });
} catch (err) {
  server.log.error(err);
  Deno.exit(1);
}
