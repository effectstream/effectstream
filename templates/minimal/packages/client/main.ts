import {
  init,
  start,
  type StartConfigApiRouter,
  type StartConfigGameStateTransitions,
} from "@paimaexample/runtime";
import { main, suspend } from "effection";
import {
  toSyncProtocolWithNetwork,
  withEffectstreamStaticConfig,
} from "@paimaexample/config";
import { contractAddressesEvmMain } from "@minimal/evm-contracts";
import {
  ConfigBuilder,
  ConfigNetworkType,
  ConfigSyncProtocolType,
} from "@paimaexample/config";
import { hardhat } from "viem/chains";
import { Type } from "@sinclair/typebox";
import type { GrammarDefinition } from "@paimaexample/concise";
import type { SyncStateUpdateStream } from "@paimaexample/coroutine";
import { PaimaSTM } from "@paimaexample/sm";
import type { BaseStfInput } from "@paimaexample/sm";
import { PrimitiveTypeEVMPaimaL2 } from "@paimaexample/sm/builtin";

const grammar = {
  my_action_name: [
    ["input", Type.String()],
  ],
} as const satisfies GrammarDefinition;

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
        (network, deployments, syncProtocol) =>
          ({
            name: "Minimal_PaimaL2",
            type: PrimitiveTypeEVMPaimaL2,
            startBlockHeight: 0,
            contractAddress: contractAddressesEvmMain()
              .chain31337["PaimaL2ContractModule#MyPaimaL2Contract"],
            paimaL2Grammar: grammar,
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
