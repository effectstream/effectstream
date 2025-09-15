import type { ConfigPrimitiveAccountingPayloadType, ConfigPrimitiveType, getEvmEvent } from "@paima/config";
import type { EvmAddress } from "@paima/utils";
import type{ StaticDecode, TSchema } from "@sinclair/typebox";
import { CommandTuple } from "@paima/concise";

/**
 * Abstract Class for Paima Primitives
 *
 * This is the interface that needs to be implemented to register a new primitive.
 * E.g., ERC721, ERC1155, etc,
 */
export abstract class PaimaPrimitive {
  // Primitive defined
  // unique name for primitive definition as chain:protocol 
  abstract internalName: `${string}:${string}`;
  // unique type for primitive; 
  // @deprecated this value should no be used, but we use it for compatibility
  abstract internalType: ConfigPrimitiveType;
  // grammar for primitive
  abstract grammar: readonly Readonly<[string, TSchema]>[];
  // event for primitive
  // @deprecated this value should no be used, but we use it for compatibility
  abstract internalEvent: ConfigPrimitiveAccountingPayloadType;
  
  // Instance defined
  abstract instanceName: string;
  abstract startBlockHeight: number;
  // TODO We need to be make a ContractAddress type.
  abstract contractAddress: EvmAddress | string; 
  // TODO This should be optional.
  abstract stateMachinePrefix: string; // | undefined;

  // Dynamic/ivm Table Global definitions
  abstract dynamicTables: undefined | ((name: string) => string);
  abstract getIntermediatePrefix():  string[];
  abstract getViewPrefix(): string[];

  abstract getConfig(): Record<string, any>;

  // Arrow function to bind 'this', as this function is passed as a reference
  public getDynamicTables = (name: string): string | undefined => {
    return this.dynamicTables?.(name);
  }

  // This returns the payload in the state machine format.
  // e.g., [stateMachinePrefix, v1, v2, v3]
  abstract getStateMachinePayload(primitiveTransactionData: any): StaticDecode<
    CommandTuple<
      typeof this.stateMachinePrefix, 
      typeof this.grammar
    >
  >;

  public getStateMachinePayloadString(primitiveTransactionData: any): string {
    return JSON.stringify(this.getStateMachinePayload(primitiveTransactionData));
  };

  // Get json object payload in format { key: value }
  abstract getPayload(primitiveTransactionData: any): Record<string, any>;
}