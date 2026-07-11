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
import { ConfigNetworkSchemaNtp } from "./ntp.ts";
import { ConfigNetworkSchemaBitcoin } from "./bitcoin.ts";
import { ConfigNetworkSchemaCelestia } from "./celestia.ts";
import { ConfigNetworkSchemaNear } from "./near.ts";
import { ConfigNetworkSchemaSolana } from "./solana.ts";
import { ConfigNetworkSchemaTest } from "./test.ts";

export const networkTypes = {
  [ConfigNetworkType.NTP]: ConfigNetworkSchemaNtp,
  [ConfigNetworkType.EVM]: ConfigNetworkSchemaEvm,
  [ConfigNetworkType.CARDANO]: ConfigNetworkSchemaCardano,
  [ConfigNetworkType.MINA]: ConfigNetworkSchemaMina,
  [ConfigNetworkType.AVAIL]: ConfigNetworkSchemaAvail,
  [ConfigNetworkType.ALGORAND]: ConfigNetworkSchemaAlgorand,
  [ConfigNetworkType.MIDNIGHT]: ConfigNetworkSchemaMidnight,
  [ConfigNetworkType.SUBSTRATE]: ConfigNetworkSchemaSubstrate,
  [ConfigNetworkType.BITCOIN]: ConfigNetworkSchemaBitcoin,
  [ConfigNetworkType.CELESTIA]: ConfigNetworkSchemaCelestia,
  [ConfigNetworkType.NEAR]: ConfigNetworkSchemaNear,
  [ConfigNetworkType.SOLANA]: ConfigNetworkSchemaSolana,
  [ConfigNetworkType.TEST]: ConfigNetworkSchemaTest,
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
