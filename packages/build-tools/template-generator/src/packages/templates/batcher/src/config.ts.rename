import {
  FileStorage,
  type BatcherConfig,
  type DefaultBatcherInput,
} from "@paimaexample/batcher";

const batchIntervalMs = 1000;
const port = Number(Deno.env.get("BATCHER_PORT") ?? "3334");

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
