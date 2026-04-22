import type { ProtocolPrimitiveMap } from "@effectstream/config";
import type { Primitive } from "./Primitive.ts";

/**
 * Registry for Effectstream Primitives
 *
 * This is a singleton that stores all the primitives that have been registered.
 * They can be retrieved by their instance-name.
 */
type UnknownPrimitive = any;
type UnknownSyncProtocol = any;
// @effectstream/db packages cannot import this package.
// so we communicate via the globalThis object.
(globalThis as any).EFFECTSTREAM_REGISTRY =
  (globalThis as any).EFFECTSTREAM_REGISTRY ??
  ({} as Record<
    string,
    Primitive<UnknownSyncProtocol, UnknownPrimitive>
  >);

export class PrimitiveRegistry {
  // Singleton to manage the primitives
  static primitives: Record<
    string,
    Primitive<UnknownSyncProtocol, UnknownPrimitive>
  > = (globalThis as any).EFFECTSTREAM_REGISTRY;

  static getPrimitive<
    SyncProtocol extends keyof ProtocolPrimitiveMap = UnknownSyncProtocol,
  >(
    instanceName: string,
  ): Primitive<SyncProtocol, UnknownPrimitive> {
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
  ): Primitive<SyncProtocol, UnknownPrimitive> | undefined {
    return Object.values(this.primitives).find((primitive) =>
      primitive.internalTypeName === type
    );
  }

  static addPrimitive(
    primitive: Primitive<UnknownSyncProtocol, UnknownPrimitive>,
  ) {
    if (this.primitives[primitive.instanceName]) {
      throw new Error(`Primitive ${primitive.instanceName} already exists`);
    }
    this.primitives[primitive.instanceName] = primitive;
  }
}
