import { ConfigPrimitiveType } from "@paima/config";
import { PaimaPrimitive } from "./PaimaPrimitive.ts";

/** 
 * Registry for Paima Primitives
 *
 * This is a singleton that stores all the primitives that have been registered.
 * They can be retrieved by their instance-name.
 */
export class PaimaPrimitiveRegistry {
    static primitives: Record<string, PaimaPrimitive> = {};
  
    static getPrimitive(instanceName: string): PaimaPrimitive | undefined {
      return this.primitives[instanceName];
    }
  
    static getPrimitiveByType(type: ConfigPrimitiveType): PaimaPrimitive | undefined {
      return Object.values(this.primitives).find((primitive) => primitive.internalType === type);
    }

    static addPrimitive(primitive: PaimaPrimitive) {
      if (this.primitives[primitive.instanceName]) {
        throw new Error(`Primitive ${primitive.instanceName} already exists`);
      }
      this.primitives[primitive.instanceName] = primitive;
    }
  }
  