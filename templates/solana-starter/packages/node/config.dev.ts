import {
  ConfigBuilder,
  ConfigNetworkType,
  ConfigSyncProtocolType,
} from "@effectstream/config";
import { PrimitiveTypeSolanaProgramLog } from "@effectstream/sm/builtin";
import { COUNTER_PROGRAM_ID } from "@solana-starter/contracts-solana/program-id";

export const config = new ConfigBuilder()
  .setNamespace((builder) => builder.setSecurityNamespace("solana-starter"))
  .buildNetworks((builder) =>
    builder
      .addNetwork({
        name: "ntp",
        type: ConfigNetworkType.NTP,
        startTime: new Date().getTime(),
        blockTimeMS: 1000,
      })
      .addNetwork({
        name: "solanaMain",
        type: ConfigNetworkType.SOLANA,
        rpcUrl: "http://localhost:8899",
        networkId: "localnet",
      }),
  )
  .buildDeployments((builder) => builder)
  .buildSyncProtocols((builder) =>
    builder
      .addMain(
        (networks) => networks.ntp,
        (_network, _deployments) => ({
          name: "mainNtp",
          type: ConfigSyncProtocolType.NTP_MAIN,
          chainUri: "",
          startBlockHeight: 1,
          pollingInterval: 1000,
        }),
      )
      .addParallel(
        (networks) => (networks as any).solanaMain,
        (_network, _deployments) => ({
          name: "parallelSolanaRPC",
          type: ConfigSyncProtocolType.SOLANA_RPC_PARALLEL,
          startBlockHeight: 0,
          pollingInterval: 2000,
          delayMs: 2400,
          confirmationDepth: 32,
          stepSize: 10,
        }),
      ),
  )
  .buildPrimitives((builder) =>
    builder.addPrimitive(
      (syncProtocols) => (syncProtocols as any).parallelSolanaRPC,
      (_network, _deployments, _syncProtocol) => ({
        name: "SolanaProgramLog",
        type: PrimitiveTypeSolanaProgramLog,
        startBlockHeight: 0,
        // The fetcher only surfaces txs whose accountKeys include this
        // programId, so point it at the counter program.
        programId: COUNTER_PROGRAM_ID,
        stateMachinePrefix: "solana-program-log",
      }),
    ),
  )
  .build();

export { COUNTER_PROGRAM_ID };
