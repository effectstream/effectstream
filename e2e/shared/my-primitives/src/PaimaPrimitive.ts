import type { ConfigPrimitiveAccountingPayloadType, ConfigPrimitiveType } from "@paima/config";
import type { EvmAddress } from "@paima/utils";
import type { StaticDecode, TSchema } from "@sinclair/typebox";
import type { CommandTuple } from "@paima/concise";
import { PaimaPrimitiveRegistry } from "./PrimitiveRegistry.ts";

/**
 * Abstract Class for Paima Primitives
 *
 * This is the interface that needs to be implemented to register a new primitive.
 * E.g., ERC721, ERC1155, etc,
 */
export abstract class PaimaPrimitive<TGrammar extends readonly Readonly<[string, TSchema]>[]> {
  constructor(
    // Instance defined unique name
    public readonly instanceName: string,
    // Start block height for the primitive
    public readonly startBlockHeight: number,
    // Contract address for the primitive
    // TODO We need to be make a ContractAddress type.
    public readonly contractAddress: /* EvmAddress | */string,
    public readonly stateMachinePrefix: string | undefined,
  ) {
    PaimaPrimitiveRegistry.addPrimitive(this);
  }
  // Primitive defined
  // unique name for primitive definition as chain:protocol 
  abstract internalName: `${string}:${string}`;
  // unique type for primitive; 
  // @deprecated this value should no be used, but we use it for compatibility
  abstract internalType: ConfigPrimitiveType;
  // grammar for primitive
  abstract grammar: TGrammar;
  // event for primitive
  // @deprecated this value should no be used, but we use it for compatibility
  abstract internalEvent: ConfigPrimitiveAccountingPayloadType;
  
  // Dynamic/ivm Table Global definitions
  dynamicTables: undefined | ((name: string) => string) = undefined;
  getIntermediatePrefix():  string[] { return []; }
  getViewPrefix(): string[] { return []; }

  // Return the config for the primitive.
  abstract getConfig(): Record<string, any>;

  // Arrow function to bind 'this', as this function is passed as a reference
  public getDynamicTables = (name: string): string | undefined => {
    return this.dynamicTables?.(name);
  }

  // This returns the payload in the state machine format.
  // e.g., [stateMachinePrefix, v1, v2, v3]
  abstract getStateMachinePayload(primitiveTransactionData: any): StaticDecode<
    CommandTuple<
      string, 
      TGrammar
    >
  >;

  public getStateMachinePayloadString(primitiveTransactionData: any): string {
    return JSON.stringify(this.getStateMachinePayload(primitiveTransactionData));
  };

  // Get json object payload in format { key: value }
  abstract getPayload(primitiveTransactionData: any): Record<string, any>;
}