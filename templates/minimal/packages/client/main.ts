import { init, start, StartConfigApiRouter, StartConfigGameStateTransitions } from "@paimaexample/runtime";
import { main, suspend } from "effection";
import {
  toSyncProtocolWithNetwork,
  withPaimaStaticConfig,
} from "@paimaexample/config";
// import { migrationTable } from "@e2e/database";
// import { gameStateTransitions } from "./state-machine.ts";
// import { apiRouter } from "./api.ts";
import { contractAddressesEvmMain } from "@minimal/evm-contracts";

import {
  ConfigBuilder,
  ConfigNetworkType,
  ConfigPrimitiveType,
  ConfigSyncProtocolType,
  getEvmEvent,
} from "@paimaexample/config";
import { hardhat } from "viem/chains";
import { paimal2contract } from "@minimal/evm-contracts";
import { Type } from "@sinclair/typebox";
import { type GrammarDefinition, mapPrimitivesToGrammar } from "@paimaexample/concise";
import { SyncStateUpdateStream, World } from "@paimaexample/coroutine";
import { PaimaSTM } from "@paimaexample/sm";
import { BaseStfInput } from "@paimaexample/sm";

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
      .addViemNetwork({
        ...hardhat,
        name: "evmMain",
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
      .addParallel((networks) => networks.evmMain, (network, deployments) => ({
        name: "mainEvmRPC",
        type: ConfigSyncProtocolType.EVM_RPC_PARALLEL,
        chainUri: network.rpcUrls.default.http[0],
        startBlockHeight: 1,
        pollingInterval: 500,
        confirmationDepth: 1,
      }))
  )
  .buildPrimitives((builder) =>
    builder
      .addPrimitive(
        (syncProtocols) => syncProtocols.mainEvmRPC,
        (network, deployments, syncProtocol) => ({
          name: "Minimal_PaimaL2",
          type: ConfigPrimitiveType.EvmRpcPaimaL2,
          startBlockHeight: 0,
          contractAddress:
            contractAddressesEvmMain().chain31337["PaimaL2#PaimaL2"],
          abi: getEvmEvent(
            paimal2contract.abi,
            "PaimaGameInteraction(address,bytes,uint256)",
          ),
        }),
      )
  )
  .build();

const grammar = {
    my_action_name: [
        ["input", Type.String()],
    ],
    // Auto-generate other primitives
    ...Object.fromEntries(
        Object.entries(mapPrimitivesToGrammar(localhostConfig.primitives)),
    ),
} as const satisfies GrammarDefinition;

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
  input: BaseStfInput
): SyncStateUpdateStream<void> {
    yield* stm.processInput(input);
};

export const apiRouter: StartConfigApiRouter = async function (
  server: any, // fastify.FastifyInstance,
  dbConn: any, // Pool,
): Promise<void> {
  server.get("/fetch-primitive-accounting", async () => {
    const result = await dbConn.query(`SELECT * FROM paima.primitive_accounting`);
    return result.rows;
    // reply.send(result.rows);
  });
};

main(function* () {
  yield* init();
  console.log("Starting Paima Engine Node");

  yield* withPaimaStaticConfig(localhostConfig, function* () {
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
