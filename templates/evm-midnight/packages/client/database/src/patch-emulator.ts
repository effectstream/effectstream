import { run } from "effection";
import { createDynamicTables } from "@paimaexample/db";
import type { Client } from "pg";
import { applyMigrations } from "@paimaexample/db/version";
import type { SyncProtocolWithNetwork } from "@paimaexample/config";
import { builtInPrimitivesMap } from "@paimaexample/sm";

// TODO Update this to use the internal patch-emulator.ts

/**
 * This is to generate the user/custom pgtyped files in compilation time
 * MIGRATIONS environment variable is used to specify the path to the migrations folder.
 * Every file in the migrations folder is executed in order.
 * TODO: Implement how to manage the order of the migrations, e.g. 1.sql, 2.sql, 10.sql, etc.
 */

export async function standAloneApplyMigrations(
  db: Client,
  migrationTable: /*DBMigrations[]*/ any[],
  localhostConfig: SyncProtocolWithNetwork,
  userDefinedPrimitives?: Record<string, any>,
) {
  const l: SyncProtocolWithNetwork = localhostConfig as any;
  const config = Object.entries(l.primitives).map(([key, value]: [string, any]) => {

    const primitiveType = value.primitive.type;
    const primitiveUniqueName = value.primitive.name;
    const primitiveConfig = value.primitive;
    const isBuiltInPrimitive = primitiveType in builtInPrimitivesMap;
    const isUserDefinedPrimitive = userDefinedPrimitives && primitiveType in userDefinedPrimitives;
    const classConfig = {
      ...primitiveConfig,
      instanceName: primitiveUniqueName,
    }
    if (isBuiltInPrimitive) {
      new builtInPrimitivesMap[primitiveType as keyof typeof builtInPrimitivesMap](classConfig as any) ;
    } else if (isUserDefinedPrimitive) {
      new userDefinedPrimitives[primitiveType as keyof typeof userDefinedPrimitives](classConfig);
    } else {
      throw new Error(`Primitive ${primitiveType} not found`);
    }

    return {
      config: {
        primitives: [{
          primitive: {
            type: value.primitive.type,
            name: value.primitive.name,
          },
        }],
      },
    };
  });


  await run(function* () {
    return yield* createDynamicTables(
      {
        engine_current_version: "0.0.0",
        engine_previous_version: "0.0.0",
        app_previous_version: "0.0.0",
        is_empty: true,
      },
      0,
      db,
      config as any,
    );
  });
  const migrations = migrationTable;

  for (const migration of migrations) {
    await applyMigrations(
      db,
      0,
      migration.name,
      migration.sql,
      false,
    );
  }
}

