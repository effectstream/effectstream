import {
  FileStorage,
  MidnightAdapter,
  type PaimaBatcherConfig,
} from "@paimaexample/batcher";

const batchIntervalMs = 1000;
const port = Number(Deno.env.get("BATCHER_PORT") ?? "3334");

export const config: PaimaBatcherConfig = {
  pollingIntervalMs: batchIntervalMs,
  namespace: "",
  confirmationLevel: "wait-effectstream-processed", // Connector expectation
  enableHttpServer: true,
  enableEventSystem: true,
  port,
};

export const storage = new FileStorage("./batcher-data");
