import type { DefaultBatcherInput } from "./types.ts";
import type { Batcher } from "./batcher.ts";

/**
 * Default grammar for batcher lifecycle events.
 * Consumers can treat prefixes as string keys and payload as unknown
 * if they don't need compile-time safety.
 */
export type BatcherGrammar = Record<string, unknown> & {
  startup: {
    publicConfig: ReturnType<Batcher<any>["getPublicConfig"]>;
    time: number;
  };
  "http:start": { port: number; time: number };
  "http:stop": { time: number };
  "poll:targets-ready": { targets: string[]; time: number };
  "batch:process:start": { target: string; inputCount: number; time: number };
  "batch:fee-estimate": { target: string; estimatedFee: bigint; time: number };
  "batch:submit": {
    target: string;
    estimatedFee: bigint;
    txHash: string;
    time: number;
  };
  "batch:receipt": {
    target: string;
    blockNumber: number | bigint;
    time: number;
  };
  "batch:effectstream-processed": {
    target: string;
    latestBlock: number;
    rollup: number;
    time: number;
  };
  "batch:process:end": {
    target: string;
    processedCount: number;
    success: boolean;
    time: number;
  };
  error: { phase: string; target?: string; error: unknown; time: number };
};

export type BatcherListener<
  Grammar extends Record<string, unknown>,
  Prefix extends keyof Grammar & string,
> = (payload: Grammar[Prefix]) => void | Promise<void>;

/**
 * Helper to attach console logs for common events. This does NOT auto-attach.
 * Call from the entrypoint if you want the default banner and lifecycle logs.
 */
export function attachDefaultConsoleListeners<
  T extends DefaultBatcherInput = DefaultBatcherInput,
>(
  batcher: Batcher<T>,
): void {
  try {
    batcher.addStateTransition("startup", ({ publicConfig }) => {
      const banner =
        `🎯 Batcher started - polling every ${publicConfig.pollingIntervalMs} ms\n` +
        `      | 📍 Default Target: ${publicConfig.defaultTarget}\n` +
        `      | ⛓️ Adapter Targets: ${
          publicConfig.adapterTargets.join(", ")
        }\n` +
        `      | 📦 Batching Criteria: ${
          Object.entries(publicConfig.criteriaTypes).map(([target, type]) =>
            `${target}=${type}`
          ).join(", ")
        }\n` +
        `${
          publicConfig.enableHttpServer
            ? `      | 🌐 HTTP Server: http://localhost:${publicConfig.port}\n`
            : ""
        }` +
        `      | 📋 Press Ctrl+C to stop gracefully`;
      console.log(banner);
    });
  } catch {
    // ignore duplicate registration
  }
}
