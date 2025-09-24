import type { ConfigSyncProtocolType } from "@paima/config";
import type { PaimaPrimitive } from "./PaimaPrimitive.ts";

/**
 * Registry for Paima Primitives
 *
 * This is a singleton that stores all the primitives that have been registered.
 * They can be retrieved by their instance-name.
 */
type UnknownPrimitive = any;
type UnknownSyncProtocol = any;

export class PaimaPrimitiveRegistry {
  static primitives: Record<
    string,
    PaimaPrimitive<UnknownSyncProtocol, UnknownPrimitive>
  > = {};

  static getPrimitive<
    SyncProtocol extends ConfigSyncProtocolType = UnknownSyncProtocol,
  >(
    instanceName: string,
  ): PaimaPrimitive<SyncProtocol, UnknownPrimitive> | undefined {
    const primitive = this.primitives[instanceName];
    // TODO This will be always defined
    return primitive ?? undefined;
  }

  static getPrimitiveByType<
    SyncProtocol extends ConfigSyncProtocolType = UnknownSyncProtocol,
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
