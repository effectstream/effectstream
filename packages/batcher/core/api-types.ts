import type { BatcherGrammar } from "./batcher-events.ts";

/**
 * Response from the batcher `/send-input` endpoint.
 */
export interface BatcherResponse {
  success: boolean;
  message: string;
  inputId: string;
  inputsProcessed?: number;
  transactionHash?: string;
  rollup?: number;
}

/**
 * Payload for input update events published via MQTT or the event system.
 * This represents the lifecycle state of a single input as it progresses
 * through the batching pipeline.
 */
export type InputUpdatePayload = BatcherGrammar["input:update"];

