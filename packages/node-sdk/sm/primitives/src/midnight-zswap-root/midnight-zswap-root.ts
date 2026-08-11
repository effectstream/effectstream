import { Primitive } from "../../Primitive.ts";
import {
  type AddressAndType,
  AddressType,
  type EffectstreamBlockNumber,
} from "@effectstream/utils";
import type { StaticDecode } from "@sinclair/typebox";
import {
  type CommandTuple,
  generateRawStmInput,
  type ParamToData,
} from "@effectstream/concise";
import type {
  ConfigSyncProtocolType,
  FlattenSyncProtocolIOFor,
  ProtocolPrimitiveMap,
} from "@effectstream/config";
import type { SyncStateUpdateStream } from "@effectstream/coroutine";
import { PrimitiveTypeMidnightZswapRoot } from "../builtin.ts";
import { midnightZswapRootGrammar } from "./midnight-zswap-root-grammar.ts";

/**
 * MidnightZswapRootPrimitive
 *
 * Emits the zswap coin-commitment Merkle tree root as it advances on chain.
 * The indexer's `RegularTransaction.zswapMerkleTreeRoot` is the tree root
 * *after* that transaction; this primitive surfaces the latest such root per
 * block (the last regular transaction's root), with the block timestamp.
 *
 * A node can accumulate these into a windowed "known roots" set (mirroring the
 * ledger's `past_roots`, retained for the on-chain root window) and reject an
 * offer that proves against a root the chain never held or that has aged out —
 * the root-known liveness check. Blocks with no regular transactions emit
 * nothing (the root is unchanged).
 *
 * Usage:
 *   stm.addStateTransition("myPrefix", function* (data) {
 *     const { payload } = data.parsedInput;
 *     // payload = { root, txHash } ; data.blockTimestamp is the window key
 *   });
 */
export class MidnightZswapRootPrimitive extends Primitive<
  ConfigSyncProtocolType.MIDNIGHT_PARALLEL,
  typeof midnightZswapRootGrammar
> {
  readonly internalTypeName = PrimitiveTypeMidnightZswapRoot;
  override readonly grammar = midnightZswapRootGrammar;

  override dynamicTables = undefined;
  override getIntermediatePrefix(): string[] {
    return [];
  }
  override getViewPrefix(): string[] {
    return [];
  }

  constructor(config: {
    instanceName: string;
    startBlockHeight: number;
    stateMachinePrefix: string;
  }) {
    super(config);
  }

  override *getPayload(
    _: EffectstreamBlockNumber,
    primitiveTransactionData: FlattenSyncProtocolIOFor<
      ConfigSyncProtocolType.MIDNIGHT_PARALLEL
    >,
  ): SyncStateUpdateStream<{
    isBatched: boolean;
    data: {
      fromAddressAndType: AddressAndType;
      stateMachinePayload:
        | StaticDecode<CommandTuple<string, typeof midnightZswapRootGrammar>>
        | null;
      accountingPayload: ParamToData<typeof midnightZswapRootGrammar>;
    }[];
  }> {
    const payload = primitiveTransactionData.output.payload;

    const accountingPayload: ParamToData<typeof this.grammar> = {
      payload,
    };

    const stateMachinePayload:
      | StaticDecode<CommandTuple<string, typeof this.grammar>>
      | null = this.stateMachinePrefix
      ? generateRawStmInput(
        this.grammar,
        this.stateMachinePrefix,
        accountingPayload,
      )
      : null;

    return {
      isBatched: false,
      data: [
        {
          fromAddressAndType: {
            type: AddressType.NONE,
            address: "0x0",
          },
          accountingPayload,
          stateMachinePayload,
        },
      ],
    };
  }

  override getConfig(): ProtocolPrimitiveMap[
    ConfigSyncProtocolType.MIDNIGHT_PARALLEL
  ] {
    return {
      name: this.instanceName,
      type: this.internalTypeName,
      startBlockHeight: this.startBlockHeight,
      scheduledPrefix: this.stateMachinePrefix ?? "",
    } as const;
  }
}
