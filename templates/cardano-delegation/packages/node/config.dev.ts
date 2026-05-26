import {
  ConfigBuilder,
  ConfigNetworkType,
  ConfigSyncProtocolType,
} from "@effectstream/config";
import { getConnection } from "@effectstream/db";
import { PrimitiveTypeCardanoPoolDelegation } from "@effectstream/sm/builtin";
import { getSyncPagination } from "@cardano-delegation/database";

const mainSyncProtocolName = "mainNtp";
let launchStartTime: number | undefined;
let yaciDevKitStartTime: number | undefined;

if (typeof process !== "undefined") {
  const dbConn = getConnection();
  try {
    const rows = await getSyncPagination.run(
      { protocol_name: mainSyncProtocolName },
      dbConn,
    );
    if (!rows.length) throw new Error("DB is empty");
    launchStartTime =
      (rows[0].page as any).root - rows[0].page_number * 1000;
  } catch {
    // DB not initialized yet
  }

  try {
    const latestResponse = await fetch("http://localhost:3000/blocks/latest");
    const latestBlock = await latestResponse.json();
    yaciDevKitStartTime = latestBlock.time * 1000;
    yaciDevKitStartTime = new Date().getTime() - yaciDevKitStartTime;
    console.log("yaciDevKitStartTime:", yaciDevKitStartTime);
  } catch {
    // Dolos not available yet
  }
}

export const config = new ConfigBuilder()
  .setNamespace((builder) => builder.setSecurityNamespace("cardano-delegation"))
  .buildNetworks((builder) =>
    builder
      .addNetwork({
        name: "ntp",
        type: ConfigNetworkType.NTP,
        startTime: launchStartTime ?? new Date().getTime(),
        blockTimeMS: 1000,
      })
      .addNetwork({
        name: "yaci",
        type: ConfigNetworkType.CARDANO,
        nodeUrl: "http://127.0.0.1:10000",
        network: "yaci",
      }),
  )
  .buildDeployments((builder) => builder)
  .buildSyncProtocols((builder) =>
    builder
      .addMain(
        (networks) => networks.ntp,
        () => ({
          name: mainSyncProtocolName,
          type: ConfigSyncProtocolType.NTP_MAIN,
          chainUri: "",
          startBlockHeight: 1,
          pollingInterval: 1000,
        }),
      )
      .addParallel(
        (networks) => (networks as any).yaci,
        () => ({
          name: "parallelUtxoRpc",
          type: ConfigSyncProtocolType.CARDANO_UTXORPC_PARALLEL,
          rpcUrl: "http://127.0.0.1:50051",
          startChainPoint: "origin",
          confirmationDepth: 0,
          delayMs: yaciDevKitStartTime ?? 0,
          pollingInterval: 1000,
          headers: { "x-rpc-key": "dev" },
        }),
      ),
  )
  .buildPrimitives((builder) =>
    builder.addPrimitive(
      (syncProtocols) => (syncProtocols as any).parallelUtxoRpc,
      () => ({
        name: "CardanoPoolDelegation",
        type: PrimitiveTypeCardanoPoolDelegation,
        startBlockHeight: 1,
        stateMachinePrefix: "cardano-pool-delegation",
        pools: [
          "7301761068762f5900bde9eb7c1c15b09840285130f5b0f53606cc57",
          "82ec502f8c0a51e7c0db410e6722dd42df3b8e11f48e833f9fdf2941",
        ],
        network: "yaci",
      }),
    ),
  )
  .build();
