// import deployedEvmAddresses from "@example/evm-contracts/deployments";
/*
#!/bin/bash
# Script to deploy PaimaL2Contract and Erc20Dev contracts
forge create src/contracts/PaimaL2Contract.sol:PaimaL2Contract \
--broadcast --rpc-url 0.0.0.0:8545 \
--private-key 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80 \
--constructor-args 0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266 0
# Deployed to: 0x5FbDB2315678afecb367f032d93F642f64180aa3

forge create src/contracts/dev/Erc20Dev.sol:Erc20Dev \
--broadcast --rpc-url 0.0.0.0:8545 \
--private-key 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
# Deployed to: 0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512
*/
const deployedEvmAddresses = {
  "chain-31337": {
    "L2Contract#PaimaL2Contract": "0x5FbDB2315678afecb367f032d93F642f64180aa3",
    "Foo#SomeERC20": "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512",
  },
} as const;
import {
  ConfigBuilder,
  ConfigNetworkType,
  ConfigPrimitiveType,
  ConfigSyncProtocolType,
  getEvmEvent,
} from "@paima/config";
import { hardhat } from "viem/chains";
import type { BlockNumber, TimestampMs } from "@paima/utils";

// TODO: replace with @paima/evm-contracts
import { erc20Abi, erc721Abi } from "viem"; // TODO: ABIs for Paima built-in primitives should be in the @paima/evm-contracts ideally
import { abi as paimal2 } from "./PaimaL2Contract.ts";
// TODO: fill this out
const stfInputs = {
  tokenTransfer: "transfer",
  paimaSubmitGameInput: "paimaSubmitGameInput",
} as const;

// comes from hardhat.config.ts
const parallelBlockTime: TimestampMs = 10 * 1000;

export const localhostConfig = new ConfigBuilder()
  .setNamespace(
    (builder) => builder.setSecurityNamespace("asdf"),
  )
  .buildNetworks((builder) =>
    builder
      .addViemNetwork({
        ...hardhat,
        name: "evmMain",
      })
      .addViemNetwork({
        ...hardhat,
        name: "evmParallel",
        rpcUrls: {
          default: { http: ["http://127.0.0.1:8546"] },
        },
        id: 31338, // taken from hardhat.config.ts
      })
      .addNetwork({
        name: "yaci",
        type: ConfigNetworkType.CARDANO,
        nodeUrl: "http://127.0.0.1:10000", // yaci-devkit default URL
        network: "yaci",
      })
  )
  .buildDeployments((builder) =>
    builder.addDeployment(
      (networks) => networks.evmMain,
      (_network) => ({
        "mock": "0x0000000000000000000000000000000000000000",
      }),
    )
  ).buildSyncProtocols((builder) =>
    builder
      .addMain((networks) => networks.evmMain, (network, deployments) => ({
        name: "mainEvmRPC",
        type: ConfigSyncProtocolType.EVM_RPC_MAIN,
        chainUri: network.rpcUrls.default.http[0],
        startBlockHeight: 1,
        pollingInterval: 500, // poll quickly to react fast
      }))
      .addParallel(
        (networks) => networks.evmParallel,
        (network, deployments) => ({
          name: "parallelEvmRPC",
          type: ConfigSyncProtocolType.EVM_RPC_PARALLEL,
          chainUri: network.rpcUrls.default.http[0],
          pollingInterval: 1000, // we can poll slower since it's not a blocker
          delayMs: parallelBlockTime * 6,
          startBlockHeight: 1 as BlockNumber,
          confirmationDepth: 2, // TODO: test this
        }),
      )
      .addParallel(
        (networks) => networks.yaci,
        (network, deployments) => ({
          name: "parallelUtxoRpc",
          type: ConfigSyncProtocolType.CARDANO_UTXORPC_PARALLEL,
          rpcUrl: "http://127.0.0.1:50051", // dolos utxorpc address
          startSlot: 1,
        }),
      )
  )
  .buildPrimitives((builder) =>
    builder.addPrimitive(
      (syncProtocols) => syncProtocols.mainEvmRPC,
      (network, deployments, syncProtocol) => ({
        name: "TransferEvent",
        type: ConfigPrimitiveType.EvmRpcERC20,

        startBlockHeight: 0,
        contractAddress: deployedEvmAddresses["chain-31337"]["Foo#SomeERC20"],
        abi: getEvmEvent(erc20Abi, "Transfer(address,address,uint256)"),
        scheduledPrefix: stfInputs.tokenTransfer,
      }),
    )
      .addPrimitive(
        (syncProtocols) => syncProtocols.mainEvmRPC,
        (network, deployments, syncProtocol) => ({
          name: "PaimaGameInteraction",
          type: ConfigPrimitiveType.EvmRpcPaimaL2,
          startBlockHeight: 0,
          contractAddress:
            deployedEvmAddresses["chain-31337"]["L2Contract#PaimaL2Contract"],
          abi: getEvmEvent(
            paimal2.abi,
            "PaimaGameInteraction(address,bytes,uint256)",
          ),
          scheduledPrefix: stfInputs.paimaSubmitGameInput,
        }),
      )
  )
  .build();
