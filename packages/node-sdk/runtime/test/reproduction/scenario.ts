/**
 * Shared scenario building blocks for the reproduction tests.
 *
 * Both the in-process test files and the out-of-process {@link ./node-runner.ts}
 * subprocess build the *same* synthetic `test`-chain config from these helpers,
 * so a node booted in a child process is identical to one a test would describe.
 * Keeping the config + primitive here (no DB, no cluster imports) lets the
 * subprocess import it cheaply.
 */
import {
  ConfigBuilder,
  ConfigNetworkType,
  ConfigSyncProtocolType,
} from "@effectstream/config";
import { Primitive } from "@effectstream/sm";

/** Fixed wall-clock origin so block timestamps are pure arithmetic. */
export const START_TIME = 1_700_000_000_000;
export const BLOCK_TIME_MS = 1000;

export type EventSpec = { atBlock: number; marker: string };

export type ScenarioOpts = {
  events: EventSpec[];
  /** Parallel-chain page size. Large (default 1000) => whole tip is one chunk. */
  parallelStepSize?: number;
  /** Security namespace; distinct per test keeps databases independent. */
  securityNamespace?: string;
};

export function buildConfig(opts: ScenarioOpts) {
  const stepSize = opts.parallelStepSize ?? 1000;
  const namespace = opts.securityNamespace ?? "sync-repro";
  return new ConfigBuilder()
    .setNamespace((b) => b.setSecurityNamespace(namespace))
    .buildNetworks((b) =>
      b
        .addNetwork({
          name: "clock",
          type: ConfigNetworkType.TEST,
          startTime: START_TIME,
          blockTimeMS: BLOCK_TIME_MS,
        })
        .addNetwork({
          name: "chainP",
          type: ConfigNetworkType.TEST,
          startTime: START_TIME,
          blockTimeMS: BLOCK_TIME_MS,
        })
    )
    .buildDeployments((b) => b)
    .buildSyncProtocols((b) =>
      b
        .addMain(
          (n) => n.clock,
          () => ({
            name: "mainClock",
            type: ConfigSyncProtocolType.TEST_MAIN,
            startBlockHeight: 1,
            pollingInterval: 30,
            stepSize: 1000,
          }),
        )
        .addParallel(
          (n) => (n as any).chainP,
          () => ({
            name: "parallelP",
            type: ConfigSyncProtocolType.TEST_PARALLEL,
            startBlockHeight: 1,
            pollingInterval: 30,
            stepSize,
            delayMs: 0,
            events: opts.events.map((e) => ({
              atBlock: e.atBlock,
              payload: { marker: e.marker },
            })),
          }),
        )
    )
    .buildPrimitives((b) =>
      b.addPrimitive(
        (sp) => (sp as any).parallelP,
        () => ({
          name: "testEvt",
          type: TEST_PRIMITIVE_TYPE,
          startBlockHeight: 1,
        }),
      )
    )
    .build();
}

// ── A minimal user-defined primitive ─────────────────────────────────────────
// Writes one row to effectstream.primitive_accounting per event (no STF needed:
// stateMachinePayload is null). Tests assert on that table.
export const TEST_PRIMITIVE_TYPE = "TEST:EVENT";

export class TestEventPrimitive extends Primitive<any, any> {
  readonly internalTypeName = TEST_PRIMITIVE_TYPE as any;
  override grammar = [] as any;
  constructor(config: any) {
    super(config);
  }
  // deno-lint-ignore require-yield
  override *getPayload(_height: any, primitiveTransactionData: any): any {
    const payload = primitiveTransactionData.output.payload;
    return {
      isBatched: false,
      data: [
        {
          fromAddressAndType: { type: "none", address: "0x0" },
          accountingPayload: payload,
          stateMachinePayload: null,
        },
      ],
    };
  }
  override getConfig(): any {
    return {
      name: this.instanceName,
      type: this.internalTypeName,
      startBlockHeight: this.startBlockHeight,
      scheduledPrefix: this.stateMachinePrefix,
    };
  }
}
