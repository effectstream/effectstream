import { init, start } from "@effectstream/runtime";
import { main, suspend } from "effection";
import {
  ConfigBuilder,
  ConfigNetworkType,
  ConfigSyncProtocolType,
  toSyncProtocolWithNetwork,
  withEffectstreamStaticConfig,
} from "@effectstream/config";
import type { StartConfigAppStateTransitions } from "@effectstream/runtime";
import type { BaseStfInput } from "@effectstream/sm";
import type { SyncStateUpdateStream } from "@effectstream/coroutine";
import { migrationTable } from "@projected-nft-preorder/database";
import { PrimitiveTypeCardanoProjectedNFT } from "@effectstream/sm/builtin";

// Step 4: NTP + YACI parallel sync + ProjectedNFT primitive on parallel
const config = new ConfigBuilder()
  .setNamespace((b) => b.setSecurityNamespace("projected-nft-preorder"))
  .buildNetworks((b) =>
    b
      .addNetwork({
        name: "ntp",
        type: ConfigNetworkType.NTP,
        startTime: new Date().getTime(),
        blockTimeMS: 1000,
      })
      .addNetwork({
        name: "yaci",
        type: ConfigNetworkType.CARDANO,
        nodeUrl: "http://127.0.0.1:10000",
        network: "yaci",
      })
  )
  .buildDeployments((b) => b)
  .buildSyncProtocols((b) =>
    b
      .addMain(
        (networks) => networks.ntp,
        () => ({
          name: "mainNtp",
          type: ConfigSyncProtocolType.NTP_MAIN,
          chainUri: "",
          startBlockHeight: 1,
          pollingInterval: 1000,
        })
      )
      .addParallel(
        (networks) => (networks as any).yaci,
        () => ({
          name: "parallelUtxoRpc",
          type: ConfigSyncProtocolType.CARDANO_UTXORPC_PARALLEL,
          rpcUrl: "http://127.0.0.1:50051",
          startChainPoint: "origin",
          delayMs: 0,
          pollingInterval: 1000,
          headers: { "x-rpc-key": "dev" },
        })
      )
  )
  .buildPrimitives((b) =>
    b.addPrimitive(
      (syncProtocols) => (syncProtocols as any).parallelUtxoRpc,
      () => ({
        name: "CardanoProjectedNFT",
        type: PrimitiveTypeCardanoProjectedNFT,
        startBlockHeight: 1,
        stateMachinePrefix: "cardano-projected-nft",
        scriptHash: "0000000000000000000000000000000000000000000000000000000000",
      }),
    )
  )
  .build();

// Step 2: No-op state machine
const appStateTransitions: StartConfigAppStateTransitions = function* (
  _blockHeight: number,
  _input: BaseStfInput,
): SyncStateUpdateStream<void> {};

main(function* () {
  yield* init();
  console.log("[MINIMAL] Step 4: NTP + YACI parallel + migrations + ProjectedNFT on parallel");

  yield* withEffectstreamStaticConfig(config, function* () {
    yield* start({
      appName: "projected-nft-preorder",
      appVersion: "1.0.0",
      syncInfo: toSyncProtocolWithNetwork(config),
      appStateTransitions,
      migrations: migrationTable,
      // NO grammar
      // NO apiRouter
    });
  });

  yield* suspend();
});
