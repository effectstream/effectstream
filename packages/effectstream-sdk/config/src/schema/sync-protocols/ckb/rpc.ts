import type { Static } from "@sinclair/typebox";
import { Type } from "@sinclair/typebox";
import type { MergeIntersects } from "@effectstream/utils";
import { TypeboxHelpers } from "@effectstream/utils";
import { ConfigSyncProtocolType } from "../types.ts";
import { ConfigSchema } from "../../utils.ts";
import { NameField, PollingSyncProtocol, StartStopBlockheight } from "../../common.ts";
import {
  CommonResponseParallelSyncProtocol,
  genCommonResponse,
  type ConfigSyncProtocolCommonResponse,
} from "../common.ts";

const TargetScript = Type.Object({
  role: Type.Union([Type.Literal("lock"), Type.Literal("type")]),
  script: Type.Object({
    codeHash: Type.String({ pattern: "^0x[0-9a-fA-F]{64}$" }),
    hashType: Type.Union([
      Type.Literal("data"),
      Type.Literal("type"),
      Type.Literal("data1"),
      Type.Literal("data2"),
    ]),
    args: Type.String({ pattern: "^0x(?:[0-9a-fA-F]{2})*$" }),
  }),
});

export const ConfigSyncProtocolSchemaCkbParallel = NameField
  .cloneMerge(PollingSyncProtocol)
  .cloneMerge(StartStopBlockheight)
  .cloneMerge({
    required: Type.Object({
      type: Type.Literal(ConfigSyncProtocolType.CKB_RPC_PARALLEL),
      confirmationDepth: Type.Number({ minimum: 0, default: 6 }),
      reorgWindow: Type.Number({ minimum: 1, default: 24 }),
      targetScript: TargetScript,
    }),
    optional: Type.Object({
      delayMs: TypeboxHelpers.IntervalMs({ default: 1_000 }),
      stepSize: Type.Number({ minimum: 1, default: 25 }),
    }),
  });

export type ConfigSyncProtocolCkbParallel = MergeIntersects<
  Static<ReturnType<typeof ConfigSyncProtocolSchemaCkbParallel.allProperties<true>>>
>;

const CkbHash = Type.String({ pattern: "^0x[0-9a-f]{64}$" });
export const CommonResponseCkbRpcParallel = genCommonResponse(
  CommonResponseParallelSyncProtocol,
  {
    internal: { transactionHash: CkbHash },
    payload: {
      primitiveName: Type.String(),
      ownChain: Type.Object({ blockNumber: TypeboxHelpers.BlockNumber() }),
      eventId: Type.String({ pattern: "^ckb-cell-created:[0-9a-f]{64}$" }),
      network: Type.Union([Type.Literal("devnet"), Type.Literal("testnet"), Type.Literal("mainnet")]),
      genesisBlockHash: CkbHash,
      blockHeight: Type.String({ pattern: "^(0|[1-9][0-9]*)$" }),
      blockHash: CkbHash,
      transactionHash: CkbHash,
      transactionIndex: Type.String({ pattern: "^(0|[1-9][0-9]*)$" }),
      outputIndex: Type.String({ pattern: "^(0|[1-9][0-9]*)$" }),
      capacityShannons: Type.String({ pattern: "^(0|[1-9][0-9]*)$" }),
      matchedScriptRole: Type.Union([Type.Literal("lock"), Type.Literal("type")]),
      matchedScriptHash: CkbHash,
      typeScriptHash: Type.Optional(CkbHash),
      dataHash: CkbHash,
      confirmationDepth: Type.String({ pattern: "^(0|[1-9][0-9]*)$" }),
      requiredConfirmationDepth: Type.String({ pattern: "^(0|[1-9][0-9]*)$" }),
    },
  } satisfies ConfigSyncProtocolCommonResponse,
);
