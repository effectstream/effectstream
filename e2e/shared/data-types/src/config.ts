import { readMidnightContract } from "@e2e/midnight-contracts";
import { contractAddressesEvmMain } from "@e2e/evm-contracts";
import { readAvailApplication } from "@e2e/avail-contracts";
import { getConnection } from "@paima/db";
import {
  ConfigBuilder,
  ConfigNetworkType,
  ConfigPrimitiveType,
  ConfigSyncProtocolType,
  getEvmEvent,
} from "@paima/config";
import { hardhat } from "viem/chains";
import type { BlockNumber } from "@paima/utils";
import { erc20dev, erc721dev, paimal2contract } from "@e2e/evm-contracts";

// TODO: This should typed from the grammar types.
const stfInputs = {
  "schedule": "schedule",
  "attack": "attack",
  "transfer": "transfer",
  "switchMap": "switchMap",
} as const;

// TODO: This is a workaround to disable yaci-devkit in linux for testing.
//       There is a unknown error when launching this process.
//       error: Text file busy (os error 26)
const yaci_enabled = Deno.env.get("DISABLE_LINUX_YACI") === "true"
  ? false
  : true;

/**
 * Let check if the db.
 * If empty then the db is not initialized, and use the current time for the NTP sync.
 * If not, we recreate the original state configuration.
 */

const mainSyncProtocolName = "mainNtp";
let launchStartTime: number | undefined;
const dbConn = getConnection();
try {
  const result = await dbConn.query(`
    SELECT * FROM paima.sync_protocol_pagination 
    WHERE protocol_name = '${mainSyncProtocolName}' 
    ORDER BY page_number ASC
    LIMIT 1
  `);
  if (!result || !result.rows.length) {
    throw new Error("DB is empty");
  }
  launchStartTime = result.rows[0].page.root -
    (result.rows[0].page_number * 1000);
} catch {
  // This is not an error.
  // Do nothing, the DB has not been initialized yet.
}

export const localhostConfig = new ConfigBuilder()
  .setNamespace(
    (builder) => builder.setSecurityNamespace("example-e2e-test"),
  )
  .buildNetworks((builder) => {
    let b = builder
      .addNetwork({
        name: "ntp",
        type: ConfigNetworkType.NTP,
        // Initial time for the Paima Engine Node. Unix Timestamp in milliseconds.
        // Give 2 minutes to the server to start syncing.
        // In development mode local chains can take a while to start and deploy contracts.
        startTime: launchStartTime ?? new Date().getTime(),
        // Block size is milliseconds, this will be used to sync other chains.
        // Block times will be exact, and not affected by the network latency, or server time.
        blockTimeMS: 1000,
      })
      .addViemNetwork({
        ...hardhat,
        name: "evmParallel_fast",
      })
      .addViemNetwork({
        ...hardhat,
        name: "evmParallel_slow",
        rpcUrls: {
          default: { http: ["http://127.0.0.1:8546"] },
        },
        id: 31338, // taken from hardhat.config.ts
      })
      .addNetwork({
        name: "midnight",
        type: ConfigNetworkType.MIDNIGHT,
        genesisHash:
          "0x0000000000000000000000000000000000000000000000000000000000000001",
        networkId: 0,
        nodeUrl: "http://127.0.0.1:9944",
      })
      .addNetwork({
        name: "avail",
        type: ConfigNetworkType.AVAIL,
        genesisSeed: "//Alice",
        nodeUrl: "ws://127.0.0.1:9955/ws",
        genesisHash: readAvailApplication().genesisHash,
        caip2: `avail:local`,
      });

    if (yaci_enabled) {
      b = b
        .addNetwork({
          name: "yaci",
          type: ConfigNetworkType.CARDANO,
          nodeUrl: "http://127.0.0.1:10000", // yaci-devkit default URL
          network: "yaci",
        });
    }
    return b;
  })
  .buildDeployments((builder) =>
    builder
      .addDeployment(
        (networks) => networks.evmParallel_fast,
        (_network) => ({
          name: "PaimaErc20DevModule#PaimaErc20Dev",
          address: contractAddressesEvmMain()
            .chain31337["PaimaErc20DevModule#PaimaErc20Dev"],
        }),
      )
      .addDeployment(
        (networks) => networks.evmParallel_fast,
        (_network) => ({
          name: "PaimaL2ContractModule#MyPaimaL2Contract",
          address: contractAddressesEvmMain().chain31337[
            "PaimaL2ContractModule#MyPaimaL2Contract"
          ],
        }),
      )
      .addDeployment(
        (networks) => networks.evmParallel_slow,
        (_network) => ({
          name: "PaimaErc20DevModule#PaimaErc20Dev",
          address: contractAddressesEvmMain()
            .chain31337["PaimaErc20DevModule#PaimaErc20Dev"],
        }),
      )
  ).buildSyncProtocols((builder) => {
    let result = builder
      .addMain(
        (networks) => networks.ntp,
        (network, deployments) => ({
          name: mainSyncProtocolName,
          type: ConfigSyncProtocolType.NTP_MAIN,
          chainUri: "",
          startBlockHeight: 1,
          pollingInterval: 1000,
        }),
      )
      .addParallel(
        (networks) => networks.evmParallel_fast,
        (network, deployments) => ({
          name: "parallelEvmRPC_fast",
          type: ConfigSyncProtocolType.EVM_RPC_PARALLEL,
          chainUri: network.rpcUrls.default.http[0],
          startBlockHeight: 1,
          pollingInterval: 500, // poll quickly to react fast
          confirmationDepth: 1, // TODO: test this
        }),
      )
      .addParallel(
        (networks) => networks.evmParallel_slow,
        (network, deployments) => ({
          name: "parallelEvmRPC_slow",
          type: ConfigSyncProtocolType.EVM_RPC_PARALLEL,
          chainUri: network.rpcUrls.default.http[0],
          pollingInterval: 1000, // we can poll slower since it's not a blocker
          delayMs: 1000,
          startBlockHeight: 1 as BlockNumber,
          confirmationDepth: 2, // TODO: test this
        }),
      )
      .addParallel(
        (networks) => networks.midnight,
        (network, deployments) => ({
          name: "parallelMidnight",
          type: ConfigSyncProtocolType.MIDNIGHT_PARALLEL,
          startBlockHeight: 1,
          pollingInterval: 1000,
          delayMs: 1000,
          indexer: "http://127.0.0.1:8088/api/v1/graphql",
          indexerWs: "ws://127.0.0.1:8088/api/v1/graphql/ws",
        }),
      )
      .addParallel(
        (networks) => networks.avail,
        (network, deployments) => ({
          name: "parallelAvail",
          type: ConfigSyncProtocolType.AVAIL_PARALLEL,
          rpc: network.nodeUrl,
          lightClient: network.nodeUrl,
          startBlockHeight: 0,
          pollingInterval: 10_000,
        }),
      );

    if (yaci_enabled) {
      result = result
        .addParallel(
          (networks) => (networks as any).yaci,
          (network, deployments) => ({
            name: "parallelUtxoRpc",
            type: ConfigSyncProtocolType.CARDANO_UTXORPC_PARALLEL,
            rpcUrl: "http://127.0.0.1:50051", // dolos utxorpc address
            startSlot: 1,
          }),
        );
    }

    return result;
  })
  .buildPrimitives((builder) =>
    builder.addPrimitive(
      (syncProtocols) => syncProtocols.parallelEvmRPC_fast,
      (network, deployments, syncProtocol) => ({
        name: "Aribitrum_Token",
        type: ConfigPrimitiveType.EvmRpcERC20,

        startBlockHeight: 0,
        contractAddress: contractAddressesEvmMain()
          .chain31337["PaimaErc20DevModule#PaimaErc20Dev"],
        abi: getEvmEvent(erc20dev.abi, "Transfer(address,address,uint256)"),
        scheduledPrefix: stfInputs.transfer,
      }),
    )
      .addPrimitive(
        (syncProtocols) => syncProtocols.parallelEvmRPC_fast,
        (network, deployments, syncProtocol) => ({
          name: "PaimaGameInteraction",
          type: ConfigPrimitiveType.EvmRpcPaimaL2,
          startBlockHeight: 0,
          contractAddress: contractAddressesEvmMain()["chain31337"][
            "PaimaL2ContractModule#MyPaimaL2Contract"
          ],
          abi: getEvmEvent(
            paimal2contract.abi,
            "PaimaGameInteraction(address,bytes,uint256)",
          ),
        }),
      )
      .addPrimitive(
        (syncProtocols) => syncProtocols.parallelMidnight,
        (network, deployments, syncProtocol) => ({
          name: "MidnightContractState",
          type: ConfigPrimitiveType.MidnightContractState,
          startBlockHeight: 1,
          contractAddress: readMidnightContract().contractAddress,
          scheduledPrefix: "midnightContractState",
        }),
      )
      .addPrimitive(
        (syncProtocols) => syncProtocols.parallelEvmRPC_fast,
        (network, deployments, syncProtocol) => ({
          name: "Arbitrum_ERC721",
          type: ConfigPrimitiveType.EvmRpcERC721,
          startBlockHeight: 0,
          contractAddress:
            contractAddressesEvmMain().chain31337["Erc721DevModule#Erc721Dev"],
          abi: getEvmEvent(
            erc721dev.abi,
            "Transfer(address,address,uint256)",
          ),
          // TODO This is not defined. Should be a error.
          scheduledPrefix: "transfer-assets",
        }),
      )
      .addPrimitive(
        (syncProtocols) => syncProtocols.parallelEvmRPC_slow,
        (network, deployments, syncProtocol) => ({
          name: "L1_ERC721_Token",
          type: ConfigPrimitiveType.EvmRpcERC721,
          startBlockHeight: 0,
          contractAddress:
            contractAddressesEvmMain().chain31338["Erc721DevModule#Erc721Dev"],
          abi: getEvmEvent(
            erc721dev.abi,
            "Transfer(address,address,uint256)",
          ),
          // TODO This is not defined. Should be a error.
          scheduledPrefix: "transfer-assets",
        }),
      )
      .addPrimitive(
        (syncProtocols) => syncProtocols.parallelEvmRPC_slow,
        (network, deployments, syncProtocol) => ({
          name: "ETH_L1_ERC20",
          type: ConfigPrimitiveType.EvmRpcERC20,
          startBlockHeight: 0,
          contractAddress: contractAddressesEvmMain()
            .chain31338["PaimaErc20DevModule#PaimaErc20Dev"],
          abi: getEvmEvent(
            erc20dev.abi,
            "Transfer(address,address,uint256)",
          ),
          // TODO This is not defined. Should be a error.
          scheduledPrefix: "transfer-erc20-2",
        }),
      )
      .addPrimitive(
        (syncProtocols) => syncProtocols.parallelAvail,
        (network, deployments, syncProtocol) => ({
          name: "AvailContractState",
          type: ConfigPrimitiveType.AvailPaimaL2,
          startBlockHeight: 1,
          appId: readAvailApplication().appId,
          contractAddress: readAvailApplication().ApplicationKey,
          genesisHash: readAvailApplication().genesisHash,
          scheduledPrefix: "avail-app-state",
        }),
      )
  )
  .build();
