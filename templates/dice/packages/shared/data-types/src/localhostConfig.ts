import { contractAddressesEvmMain } from "@dice/evm-contracts";
import { PrimitiveTypeEVMPaimaL2, PrimitiveTypeEVMERC721 } from "@paimaexample/sm/builtin";
import {
  ConfigBuilder,
  ConfigNetworkType,
  ConfigSyncProtocolType,
} from "@paimaexample/config";
import { hardhat } from "viem/chains";
import { grammar } from "@dice/data-types/grammar";

export const localhostConfig = new ConfigBuilder()
  .setNamespace(
    (builder) => builder.setSecurityNamespace("dice-node"),
  )
  .buildNetworks((builder) =>
    builder
      .addNetwork({
        name: "ntp",
        type: ConfigNetworkType.NTP,
        // Initial time for the Paima Engine Node. Unix Timestamp in milliseconds.
        // Give 2 minutes to the server to start syncing.
        startTime: new Date().getTime(),
        // Block size is milliseconds, this will be used to sync other chains.
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
            name: "Dice_PaimaL2",
            type: PrimitiveTypeEVMPaimaL2,
            startBlockHeight: 0,
            contractAddress:
              contractAddressesEvmMain()
                .chain31337["L2Contract#PaimaL2Contract"],
            paimaL2Grammar: grammar,
          }),
      )
      .addPrimitive(
        (syncProtocols) => syncProtocols.mainEvmRPC,
        (network, deployments, syncProtocol) =>
          ({
            name: "Dice_AccountNFT",
            type: PrimitiveTypeEVMERC721,
            startBlockHeight: 0,
            contractAddress:
              contractAddressesEvmMain()
                .chain31337["AccountNft#AnnotatedMintNft"],
            stateMachinePrefix: "nftMint",
          }),
      )
  )
  .build();
