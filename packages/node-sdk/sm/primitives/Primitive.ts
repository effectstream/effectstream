import type { AddressAndType, EffectstreamBlockNumber } from "@effectstream/utils";
import type { StaticDecode, TSchema } from "@sinclair/typebox";
import type { CommandTuple } from "@effectstream/concise";
import { PrimitiveRegistry } from "./PrimitiveRegistry.ts";
import type { StateUpdateStream } from "@effectstream/coroutine";
import type { JsonObject } from "./types.ts";
import type {
  FlattenSyncProtocolIOFor,
  ProtocolPrimitiveMap,
} from "@effectstream/config";
import type { AnyPrimitiveType } from "./src/builtin.ts";
import type { MaterializedViewStrategy } from "@effectstream/db";

/**
 * Abstract Class for Effectstream Primitives
 *
 * This is the interface that needs to be implemented to register a new primitive.
 * E.g., ERC721, ERC1155, etc,
 */
export abstract class Primitive<
  SyncProtocol extends keyof ProtocolPrimitiveMap,
  TGrammar extends readonly Readonly<[string, TSchema]>[],
> {
    // Instance defined unique name
  public readonly instanceName: string;
  // Start block height of the primitive
  public readonly startBlockHeight: number;
  // State machine prefix of the primitive
  public readonly stateMachinePrefix: string | undefined;

  constructor(config: {
    instanceName: string,
    startBlockHeight: number,
    stateMachinePrefix: string | undefined,
  }) {
    this.instanceName = config.instanceName;
    this.startBlockHeight = config.startBlockHeight;
    this.stateMachinePrefix = config.stateMachinePrefix;
    PrimitiveRegistry.addPrimitive(this);
  }
  // Primitive defined
  // unique name for primitive definition as chain:protocol
  abstract internalTypeName: AnyPrimitiveType;
  // grammar for primitive
  abstract grammar: TGrammar;

  // Dynamic/ivm Table Global definitions
  //
  // The `strategy` argument lets the engine pick between an incrementally
  // maintained `pg_ivm` view (when the extension is available) and a plain
  // SQL view fallback (when it isn't). All other DDL — intermediate table,
  // trigger function, trigger — is identical across strategies.
  // May return `undefined` to emit no DDL — e.g. a primitive can gate its
  // owned table behind a config flag. `getDynamicTables` already surfaces
  // `string | undefined`, and `createDynamicTables` skips on undefined.
  dynamicTables:
    | undefined
    | ((name: string, strategy: MaterializedViewStrategy) => string | undefined) =
      undefined;
  getIntermediatePrefix(): string[] {
    return [];
  }
  getViewPrefix(): string[] {
    return [];
  }

  // Return the config for the primitive.
  abstract getConfig(): ProtocolPrimitiveMap[SyncProtocol];

  // Arrow function to bind 'this', as this function is passed as a reference
  public getDynamicTables = (
    name: string,
    strategy: MaterializedViewStrategy,
  ): string | undefined => {
    return this.dynamicTables?.(name, strategy);
  };

  // This returns the payload in the state machine format.
  // e.g., [stateMachinePrefix, v1, v2, v3]
  abstract getPayload(
    effectstream_block_height: EffectstreamBlockNumber,
    primitiveTransactionData: FlattenSyncProtocolIOFor<SyncProtocol>,
  ): StateUpdateStream<{
    isBatched: boolean;
    data: {
      fromAddressAndType: AddressAndType;
      stateMachinePayload:
        | StaticDecode<
          CommandTuple<string, TGrammar>
        >
        | null;
      accountingPayload: JsonObject;
    }[];
  }>;
}
