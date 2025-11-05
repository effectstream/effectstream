import type { ProtocolPrimitiveMap } from "@effectstream/config";
import type { PaimaPrimitive } from "./PaimaPrimitive.ts";

/**
 * Registry for Paima Primitives
 *
 * This is a singleton that stores all the primitives that have been registered.
 * They can be retrieved by their instance-name.
 */
type UnknownPrimitive = any;
type UnknownSyncProtocol = any;
// @effectstream/db packages cannot import this package.
// so we communicate via the globalThis object.
(globalThis as any).PAIMA_REGISTRY =
  (globalThis as any).PAIMA_REGISTRY ??
  ({} as Record<
    string,
    PaimaPrimitive<UnknownSyncProtocol, UnknownPrimitive>
  >);

export class PaimaPrimitiveRegistry {
  // Singleton to manage the primitives
  static primitives: Record<
    string,
    PaimaPrimitive<UnknownSyncProtocol, UnknownPrimitive>
  > = (globalThis as any).PAIMA_REGISTRY;

  static getPrimitive<
    SyncProtocol extends keyof ProtocolPrimitiveMap = UnknownSyncProtocol,
  >(
    instanceName: string,
  ): PaimaPrimitive<SyncProtocol, UnknownPrimitive> {
    const primitive = this.primitives[instanceName];
    if (!primitive) {
      // This should never happen.
      throw new Error(`Primitive ${instanceName} not found`);
    }
    return primitive;
  }

  static getPrimitiveByType<
    SyncProtocol extends keyof ProtocolPrimitiveMap = UnknownSyncProtocol,
  >(
    type: string,
  ): PaimaPrimitive<SyncProtocol, UnknownPrimitive> | undefined {
    return Object.values(this.primitives).find((primitive) =>
      primitive.internalTypeName === type
    );
  }

  static addPrimitive(
    primitive: PaimaPrimitive<UnknownSyncProtocol, UnknownPrimitive>,
  ) {
    if (this.primitives[primitive.instanceName]) {
      throw new Error(`Primitive ${primitive.instanceName} already exists`);
    }
    this.primitives[primitive.instanceName] = primitive;
  }
}
