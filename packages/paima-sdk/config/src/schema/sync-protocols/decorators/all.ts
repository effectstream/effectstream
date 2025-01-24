import { Type } from "@sinclair/typebox";
import { ConfigSyncProtocolDecoratorType } from "./types.ts";
import type { ToMapping } from "../../utils.ts";
import { ConfigSyncProtocolSchemaEmulated } from "./emulated.ts";

export const decoratorSyncProtocolTypes = {
  [ConfigSyncProtocolDecoratorType.EMULATED]: ConfigSyncProtocolSchemaEmulated,
} as const;

export type AllDecorators =
  (typeof decoratorSyncProtocolTypes)[keyof typeof decoratorSyncProtocolTypes];
export type ConfigSyncProtocolMappingDecorator = ToMapping<
  ConfigSyncProtocolDecoratorType,
  typeof decoratorSyncProtocolTypes
>;

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export const ConfigSyncProtocolDecorator = <Bool extends boolean>(
  requireOptional: Bool,
) =>
  Type.Union(
    Object.values(decoratorSyncProtocolTypes).map((schema) =>
      schema.allProperties(requireOptional)
    ),
  );
