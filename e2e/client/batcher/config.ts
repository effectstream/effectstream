import {
  FileStorage,
  type BatcherConfig,
  type DefaultBatcherInput,
} from "@effectstream/batcher";
import { getEnv } from "@effectstream/utils/runtime";

// Config values mirroring e2e/client/node/scripts/start.ts
const batchIntervalMs = 1000;
const port = Number(getEnv("BATCHER_PORT") ?? (typeof process !== "undefined" ? process.env?.BATCHER_PORT : undefined) ?? "3334");

// Batcher config matching old behavior
export const config: BatcherConfig<DefaultBatcherInput> = {
  pollingIntervalMs: batchIntervalMs,
  enableHttpServer: true,
  namespace: "", // TODO start using namespace for signature verification security
  confirmationLevel: "wait-effectstream-processed",
  enableEventSystem: true, // Important for adding state transitions to console logs
  port,
};

export const storage = new FileStorage("./batcher-data");