import { contractAddressesEvmMain } from "@chess-v2/contracts-evm";
import { PrimitiveTypeEVMEffectstreamL2 } from "@effectstream/sm/builtin";
import {
  ConfigBuilder,
  ConfigNetworkType,
  ConfigSyncProtocolType,
} from "@effectstream/config";
import { hardhat } from "viem/chains";
import { grammar } from "./grammar.ts";

export const config = new ConfigBuilder()
  .setNamespace((builder) => builder.setSecurityNamespace("chess-v2"))
  .buildNetworks((builder) =>
    builder
      .addNetwork({
        name: "ntp",
        type: ConfigNetworkType.NTP,
        startTime: new Date().getTime(),
        blockTimeMS: 1000,
      })
      .addViemNetwork({ ...hardhat, name: "evmMain" })
  )
  .buildDeployments((builder) => builder)
  .buildSyncProtocols((builder) =>
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
        (networks) => networks.evmMain,
        (network, deployments) => ({
          name: "mainEvmRPC",
          type: ConfigSyncProtocolType.EVM_RPC_PARALLEL,
          chainUri: network.rpcUrls.default.http[0],
          startBlockHeight: 1,
          pollingInterval: 500,
          confirmationDepth: 1,
        }),
      )
  )
  .buildPrimitives((builder) =>
    builder
      .addPrimitive(
        (syncProtocols) => syncProtocols.mainEvmRPC,
        (network, deployments, syncProtocol) => ({
          name: "Chess_EffectstreamL2",
          type: PrimitiveTypeEVMEffectstreamL2,
          startBlockHeight: 0,
          contractAddress:
            contractAddressesEvmMain()
              .chain31337["EffectstreamL2Module#MyEffectstreamL2"],
          paimaL2Grammar: grammar,
        }),
      )
  )
  .build();
