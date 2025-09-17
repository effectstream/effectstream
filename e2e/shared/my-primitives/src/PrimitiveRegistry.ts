import type { ConfigPrimitiveType } from "@paima/config";
import type { PaimaPrimitive } from "./PaimaPrimitive.ts";

/** 
 * Registry for Paima Primitives
 *
 * This is a singleton that stores all the primitives that have been registered.
 * They can be retrieved by their instance-name.
 */
type UnknownPrimitive = any;

export class PaimaPrimitiveRegistry {
    static primitives: Record<string, PaimaPrimitive<UnknownPrimitive>> = {};
  
    static getPrimitive(instanceName: string): PaimaPrimitive<UnknownPrimitive> | undefined {
      const primitive = this.primitives[instanceName];
      // TODO This will be always defined
      return primitive ?? undefined;
    }
  
    static getPrimitiveByType(type: ConfigPrimitiveType): PaimaPrimitive<UnknownPrimitive> | undefined {
      return Object.values(this.primitives).find((primitive) => primitive.internalType === type);
    }

    static addPrimitive(primitive: PaimaPrimitive<UnknownPrimitive>) {
      if (this.primitives[primitive.instanceName]) {
        throw new Error(`Primitive ${primitive.instanceName} already exists`);
      }
      this.primitives[primitive.instanceName] = primitive;
    }
  }
  