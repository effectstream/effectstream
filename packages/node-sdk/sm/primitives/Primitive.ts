import type { AddressAndType, PaimaBlockNumber } from "@effectstream/utils";
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
  dynamicTables: undefined | ((name: string) => string) = undefined;
  getIntermediatePrefix(): string[] {
    return [];
  }
  getViewPrefix(): string[] {
    return [];
  }

  // Return the config for the primitive.
  abstract getConfig(): ProtocolPrimitiveMap[SyncProtocol];

  // Arrow function to bind 'this', as this function is passed as a reference
  public getDynamicTables = (name: string): string | undefined => {
    return this.dynamicTables?.(name);
  };

  // This returns the payload in the state machine format.
  // e.g., [stateMachinePrefix, v1, v2, v3]
  abstract getPayload(
    effectstream_block_height: PaimaBlockNumber,
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
