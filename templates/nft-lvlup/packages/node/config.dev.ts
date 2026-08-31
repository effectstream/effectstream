import { contractAddressesEvmMain } from "@nft-lvlup/contracts-evm";
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
    (builder) => builder.setSecurityNamespace("nft-lvlup-node"),
  )
  .buildNetworks((builder) =>
    builder
      .addNetwork({
        name: "ntp",
        type: ConfigNetworkType.NTP,
        // Initial time for the Effectstream Node. Unix Timestamp in milliseconds.
        // Give 2 minutes to the server to start syncing.
        // In development mode local chains can take a while to start and deploy contracts.
        startTime: new Date().getTime(),
        // Block size is milliseconds, this will be used to sync other chains.
        // Block times will be exact, and not affected by the network latency, or server time.
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
      // EffectstreamL2 — carries the L2 game actions (nftMint, lvlUp).
      .addPrimitive(
        (syncProtocols) => syncProtocols.mainEvmRPC,
        (network, deployments, syncProtocol) =>
          ({
            name: "NftLvlUp_EffectstreamL2",
            type: PrimitiveTypeEVMEffectstreamL2,
            startBlockHeight: 0,
            contractAddress:
              contractAddressesEvmMain()
                .chain31337["EffectstreamL2Module#MyEffectstreamL2"],
            paimaL2Grammar: grammar,
          }),
      )
      // Character ERC721 — tracks on-chain ownership of each character token
      // into primitives.erc721_ownership_view_nftlvlup_characternft. No
      // stateMachinePrefix: Transfer events are NOT routed to a transition
      // (the type-carrying mint arrives via the nftMint L2 action instead).
      .addPrimitive(
        (syncProtocols) => syncProtocols.mainEvmRPC,
        (network, deployments, syncProtocol) =>
          ({
            name: "NftLvlUp_CharacterNFT",
            type: PrimitiveTypeEVMERC721,
            startBlockHeight: 0,
            contractAddress:
              contractAddressesEvmMain()
                .chain31337["Character#CharacterNft"],
          }),
      )
  )
  .build();
