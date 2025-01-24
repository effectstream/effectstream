import { ConfigNetworkSchemaEvm } from "./evm.ts";
import { ConfigNetworkSchemaCardano } from "./cardano.ts";
import { ConfigNetworkSchemaMina } from "./mina.ts";
import { ConfigNetworkSchemaAvail } from "./substrate/avail.ts";
import { ConfigNetworkSchemaMidnight } from "./substrate/midnight.ts";
import { ConfigNetworkType } from "./types.ts";
import { Type } from "@sinclair/typebox";
import type { ToMapping } from "../utils.ts";
import { ConfigNetworkSchemaSubstrate } from "./substrate/common.ts";
import { ConfigNetworkSchemaAlgorand } from "./algorand.ts";

export const networkTypes = {
  [ConfigNetworkType.EVM]: ConfigNetworkSchemaEvm,
  [ConfigNetworkType.CARDANO]: ConfigNetworkSchemaCardano,
  [ConfigNetworkType.MINA]: ConfigNetworkSchemaMina,
  [ConfigNetworkType.AVAIL]: ConfigNetworkSchemaAvail,
  [ConfigNetworkType.ALGORAND]: ConfigNetworkSchemaAlgorand,
  [ConfigNetworkType.MIDNIGHT]: ConfigNetworkSchemaMidnight,
  [ConfigNetworkType.SUBSTRATE]: ConfigNetworkSchemaSubstrate,
} as const;

export type ConfigNetworkSubmapping<T extends ConfigNetworkType> = ToMapping<
  T,
  Pick<typeof networkTypes, T>
>;
export type ConfigNetworkMapping = ToMapping<
  ConfigNetworkType,
  typeof networkTypes
>;

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export const ConfigNetworkAll = <Bool extends boolean>(requireOptional: Bool) =>
  Type.Union(
    Object.values(networkTypes).map((schema) =>
      schema.allProperties(requireOptional)
    ),
  );
