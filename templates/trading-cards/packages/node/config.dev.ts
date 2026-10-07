import { contractAddressesEvmMain } from "@trading-cards/contracts-evm";
import {
  PrimitiveTypeEVMEffectstreamL2,
  PrimitiveTypeEVMERC721,
} from "@effectstream/sm/builtin";
import {
  ConfigBuilder,
  ConfigNetworkType,
  ConfigSyncProtocolType,
} from "@effectstream/config";
import { hardhat } from "viem/chains";
import { grammar } from "./grammar.ts";

export const config = new ConfigBuilder()
  .setNamespace(
    (builder) => builder.setSecurityNamespace("trading-cards-node"),
  )
  .buildNetworks((builder) =>
    builder
      .addNetwork({
        name: "ntp",
        type: ConfigNetworkType.NTP,
        // Initial time for the Effectstream Node. Unix Timestamp in milliseconds.
        startTime: new Date().getTime(),
        // Block size in milliseconds, used to sync other chains.
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
      // EffectstreamL2 — carries every L2 game action (accountMint, tradeNftMint,
      // buyCardPack, createdLobby, joinedLobby, submittedMoves, setTradeNftCards, …).
      .addPrimitive(
        (syncProtocols) => syncProtocols.mainEvmRPC,
        (network, deployments, syncProtocol) =>
          ({
            name: "TC_EffectstreamL2",
            type: PrimitiveTypeEVMEffectstreamL2,
            startBlockHeight: 0,
            contractAddress:
              contractAddressesEvmMain()
                .chain31337["EffectstreamL2Module#MyEffectstreamL2"],
            paimaL2Grammar: grammar,
          }),
      )
      // Account NFT ERC721 — tracks on-chain ownership of account NFTs. Mints
      // are also delivered as the accountMint L2 action (which carries the type
      // info the ERC721 Transfer event lacks). No stateMachinePrefix here.
      .addPrimitive(
        (syncProtocols) => syncProtocols.mainEvmRPC,
        (network, deployments, syncProtocol) =>
          ({
            name: "TC_AccountNFT",
            type: PrimitiveTypeEVMERC721,
            startBlockHeight: 0,
            contractAddress:
              contractAddressesEvmMain()
                .chain31337["AccountNft#AnnotatedMintNft"],
          }),
      )
      // Trade NFT ERC721 — tracks on-chain ownership of trade NFTs.
      // (Replaces v1's generic ERC721 `Transfer` watcher: the modern engine has
      // no generic-event primitive, so the built-in ERC721 ownership primitive
      // covers the same Transfer events.)
      .addPrimitive(
        (syncProtocols) => syncProtocols.mainEvmRPC,
        (network, deployments, syncProtocol) =>
          ({
            name: "TC_TradeNFT",
            type: PrimitiveTypeEVMERC721,
            startBlockHeight: 0,
            contractAddress:
              contractAddressesEvmMain()
                .chain31337["TradeNft#AnnotatedMintNft"],
          }),
      )
  )
  .build();
