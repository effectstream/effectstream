import {
  init,
  start,
  type StartConfigApiRouter,
  type StartConfigGameStateTransitions,
} from "@effectstream/runtime";
import { main, suspend } from "effection";
import {
  toSyncProtocolWithNetwork,
  withEffectstreamStaticConfig,
} from "@effectstream/config";
import {
  ConfigBuilder,
  ConfigNetworkType,
  ConfigSyncProtocolType,
} from "@effectstream/config";
import { Type } from "@sinclair/typebox";
import type { GrammarDefinition } from "@effectstream/concise";
import type { SyncStateUpdateStream } from "@effectstream/coroutine";
import { PaimaSTM } from "@effectstream/sm";
import type { BaseStfInput } from "@effectstream/sm";
import {
  midnightNetworkConfig,
} from "@effectstream/midnight-contracts/midnight-env";
import { PrimitiveTypeMidnightGeneric, PrimitiveTypeUtxorpcGeneric } from "@effectstream/sm/builtin";
import * as CounterContract from "@minimal-cardano/midnight-contract-counter-basic/contract";
import { readMidnightContract } from "@effectstream/midnight-contracts/read-contract";

const grammar = {
  my_action_name: [
    ["input", Type.String()],
  ],
} as const satisfies GrammarDefinition;

const response = await fetch("http://localhost:3000/blocks/latest");
const yaciDevKitStartTime = new Date().getTime() - ((await response.json()).time * 1000);
console.log("yaciDevKitStartTime", yaciDevKitStartTime);

const counterAddress = readMidnightContract(
  "contract-counter",
  { networkId: midnightNetworkConfig.id },
).contractAddress;

export const localhostConfig = new ConfigBuilder()
  .setNamespace(
    (builder) => builder.setSecurityNamespace("minimal-node"),
  )
  .buildNetworks((builder) =>
    builder
      .addNetwork({
        name: "ntp",
        type: ConfigNetworkType.NTP,
        startTime: new Date().getTime(),
        blockTimeMS: 1000,
      })
      .addNetwork({
        name: "yaci",
        type: ConfigNetworkType.CARDANO,
        nodeUrl: "http://127.0.0.1:10000", // yaci-devkit default URL
        network: "yaci",
      })
      .addNetwork({
        name: "midnight",
        type: ConfigNetworkType.MIDNIGHT,
        networkId: midnightNetworkConfig.id,
        nodeUrl: midnightNetworkConfig.node,
      })
  )
  .buildDeployments((builder) => builder).buildSyncProtocols((builder) =>
    builder
      .addMain(
        (networks) => networks.ntp,
        (network, deployments) => ({
          name: "mainNtp",
          type: ConfigSyncProtocolType.NTP_MAIN,
          chainUri: "",
          startBlockHeight: 1,
          pollingInterval: 1000,
        }),
      )
      .addParallel(
        (networks) => (networks as any).yaci,
        (network, deployments) => ({
          name: "parallelUtxoRpc",
          type: ConfigSyncProtocolType.CARDANO_UTXORPC_PARALLEL,
          rpcUrl: "http://127.0.0.1:50051", // dolos utxorpc address
          startSlot: 1,
          delayMs: yaciDevKitStartTime || 0,
          pollingInterval: 1000,
          headers: {
            'x-rpc-key': 'dev'
          }
        }),
      )
      .addParallel(
        (networks) => (networks as any).midnight,
        (network, deployments) => ({
          name: "parallelMidnight",
          type: ConfigSyncProtocolType.MIDNIGHT_PARALLEL,
          startBlockHeight: 1,
          pollingInterval: 1000,
          delayMs: 18000,
          indexer: midnightNetworkConfig.indexer,
          indexerWs: midnightNetworkConfig.indexerWS,
        }),
      )
  )
  .buildPrimitives((builder) =>
    builder
      .addPrimitive(
        (syncProtocols) => (syncProtocols as any).parallelMidnight,
        (network, deployments, syncProtocol) => ({
          name: "MidnightContractState",
          type: PrimitiveTypeMidnightGeneric,
          startBlockHeight: 1,
          contractAddress: counterAddress,
          stateMachinePrefix: "midnightContractState",
          contract: { ledger: CounterContract.ledger },
          networkId: midnightNetworkConfig.id,
        }),
      )
      .addPrimitive(
        (syncProtocols) => (syncProtocols as any).parallelUtxoRpc,
        (network, deployments, syncProtocol) => ({
          name: "UtxoRpcGeneric",
          type: PrimitiveTypeUtxorpcGeneric,
          startBlockHeight: 1,
          stateMachinePrefix: "cardano-utxo-rpc-generic",
          predicate: {
            match: {
              cardano: {
                has_address: {
                  exact_address: "cD0ktC/NQ3j7hUmyY1iMF3lu2gFFPU+MCRxVFYw="
                }
              }
            }
          },
        }),
      )
  )
  .build();

const stm = new PaimaSTM<typeof grammar, {}>(grammar);
stm.addStateTransition("my_action_name", function* (data) {
  console.log("--------------------------------");
  console.log("State Transition Function");
  console.log("Input Data:", data.parsedInput);
  console.log("--------------------------------");

  return;
});

const gameStateTransitions: StartConfigGameStateTransitions = function* (
  _blockHeight: number,
  input: BaseStfInput,
): SyncStateUpdateStream<void> {
  yield* stm.processInput(input);
};

export const apiRouter: StartConfigApiRouter = async function (
  server: any, // fastify.FastifyInstance,
  dbConn: any, // Pool,
): Promise<void> {
  server.get("/fetch-primitive-accounting", async () => {
    const result = await dbConn.query(
      `SELECT * FROM effectstream.primitive_accounting`,
    );
    return result.rows;
  });
};

main(function* () {
  yield* init();
  console.log("Starting EffectStream Node");

  yield* withEffectstreamStaticConfig(localhostConfig, function* () {
    yield* start({
      appName: "minimal-client",
      appVersion: "1.0.0",
      syncInfo: toSyncProtocolWithNetwork(localhostConfig),
      gameStateTransitions,
      migrations: undefined,
      apiRouter,
      grammar,
    });
  });

  yield* suspend();
});
