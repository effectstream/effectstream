import { contractAddressesEvmMain } from "@gamemaker/contracts-evm";
import {
  ConfigBuilder,
  ConfigNetworkType,
  ConfigSyncProtocolType,
} from "@effectstream/config";
import { PrimitiveTypeEVMEffectstreamL2 } from "@effectstream/sm/builtin";
import { hardhat } from "viem/chains";

// The v1 `extensions.yml` declared `extensions: []` (no custom primitives /
// extensions), so the only primitive is the base EffectstreamL2 — exactly
// like `templates/minimal`.
export const config = new ConfigBuilder()
  .setNamespace((builder) => builder.setSecurityNamespace("gamemaker"))
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
  .buildDeployments((builder) =>
    builder.addDeployment(
      (networks) => networks.evmMain,
      (_network) => ({
        name: "EffectstreamL2Module#MyEffectstreamL2",
        address:
          contractAddressesEvmMain().chain31337[
            "EffectstreamL2Module#MyEffectstreamL2"
          ],
      }),
    )
  )
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
        (networks) => networks.evmMain,
        (network, _deployments) => ({
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
    builder.addPrimitive(
      (syncProtocols) => syncProtocols.mainEvmRPC,
      (_network, _deployments, _syncProtocol) => ({
        name: "EffectstreamL2",
        type: PrimitiveTypeEVMEffectstreamL2,
        startBlockHeight: 0,
        contractAddress:
          contractAddressesEvmMain().chain31337[
            "EffectstreamL2Module#MyEffectstreamL2"
          ],
      }),
    )
  )
  .build();
