import { ConfigPrimitiveAccountingPayloadType, ConfigPrimitiveType, getEvmEvent } from "@paima/config";
import { EvmAddress } from "@paima/utils";

/**
 * Abstract Class for Paima Primitives
 *
 * This is the interface that needs to be implemented to register a new primitive.
 * E.g., ERC721, ERC1155, etc,
 */
export abstract class PaimaPrimitive {
  // Primitive defined
  abstract internalName: string;
  abstract internalType: ConfigPrimitiveType;
  abstract abi: ReturnType<typeof getEvmEvent>;
  abstract grammar: any; // Type TOOD;
  abstract internalEvent: ConfigPrimitiveAccountingPayloadType;
  
  // User defined
  abstract instanceName: string;
  abstract startBlockHeight: number;
  abstract contractAddress: EvmAddress;

  // Dynamic/ivm Table Global definitions
  abstract dynamicTables: (name: string) => string;
  abstract getIntermediatePrefix(): string[];
  abstract getViewPrefix(): string[];

  public getConfig() {
    return {
      name: this.instanceName,
      type: this.internalType,
      startBlockHeight: this.startBlockHeight,
      contractAddress: this.contractAddress,
      abi: this.abi,
    };
  }

  // Arrow function to bind 'this'
  public getDynamicTables = (name: string) => {
    return this.dynamicTables(name);
  }

  abstract getStateMachinePayload(prefix: string, primitiveTransactionData: any): string;
  abstract getPayload(primitiveTransactionData: any): string[];
}