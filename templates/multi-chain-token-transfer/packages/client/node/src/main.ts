import { init, start } from "@paimaexample/runtime";
import { main, suspend } from "effection";
import { localhostConfig } from "@multi-chain-transfer/data-types/localhostConfig";
import {
  type SyncProtocolWithNetwork,
  toSyncProtocolWithNetwork,
  withPaimaStaticConfig,
} from "@paimaexample/config";
import { migrationTable } from "@multi-chain-transfer/database";
import { gameStateTransitions } from "./state-machine.ts";
import { apiRouter } from "./api.ts";
import { grammar } from "@multi-chain-transfer/data-types/grammar";
import { MCTErc1155Primitive } from "@multi-chain-transfer/custom-primitive-mct-erc1155/erc1155-primitive";

main(function* () {
  yield* init();
  console.log("Starting Paima Engine Node");

  yield* withPaimaStaticConfig(localhostConfig, function* () {
    yield* start({
      appName: "multi-chain-token-transfer",
      appVersion: "0.3.21",
      syncInfo: toSyncProtocolWithNetwork(localhostConfig),
      gameStateTransitions,
      migrations: migrationTable,
      apiRouter,
      grammar,
      userDefinedPrimitives: {
        "EVM:MCT_ERC1155": MCTErc1155Primitive,
      },
    });
  });

  yield* suspend();
});
