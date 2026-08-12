// NOTE & TODO:
// Importing "@midnight-ntwrk/onchain-runtime" here is a workaround.
// Loading this package in a dependency makes the onchain-runtime wasm
// fail in runtime when trying to parse the state.
// The next line is so that the wasm is loaded and not optimized away.
import { NetworkId } from "@midnight-ntwrk/onchain-runtime";
NetworkId.Undeployed;


import { init, start } from "@paimaexample/runtime";
import { main, suspend } from "effection";
import { localhostConfig } from "@multi-chain-transfer/data-types/localhostConfig";
import {
  type SyncProtocolWithNetwork,
  toSyncProtocolWithNetwork,
  withEffectstreamStaticConfig,
} from "@paimaexample/config";
import { migrationTable } from "@multi-chain-transfer/database";
import { appStateTransitions } from "./state-machine.ts";
import { apiRouter } from "./api.ts";
import { grammar } from "@multi-chain-transfer/data-types/grammar";
import { MCTErc1155Primitive } from "@multi-chain-transfer/custom-primitive-mct-erc1155/erc1155-primitive";

main(function* () {
  yield* init();
  console.log("Starting Paima Engine Node");

  yield* withEffectstreamStaticConfig(localhostConfig, function* () {
    yield* start({
      appName: "multi-chain-token-transfer",
      appVersion: "0.3.21",
      syncInfo: toSyncProtocolWithNetwork(localhostConfig),
      appStateTransitions,
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
