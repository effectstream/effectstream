import { PrimitiveTypeEVMEffectstreamL2 } from "@effectstream/sm/builtin";
import { ConfigBuilder, ConfigNetworkType, ConfigSyncProtocolType } from "@effectstream/config";
import { grammar } from "./grammar.ts";

const EVM_RPC_URL = process.env.EVM_RPC_URL;
if (!EVM_RPC_URL) throw new Error("EVM_RPC_URL is required for mainnet");
const EVM_START_BLOCK = Number(process.env.EVM_START_BLOCK ?? "0");
const EVM_CHAIN_ID = Number(process.env.EVM_CHAIN_ID ?? "1");
const EFFECTSTREAM_L2_ADDRESS = process.env.EFFECTSTREAM_L2_ADDRESS as `0x${string}`;
if (!EFFECTSTREAM_L2_ADDRESS) throw new Error("EFFECTSTREAM_L2_ADDRESS is required for mainnet");

export const config = new ConfigBuilder()
  .setNamespace((builder) => builder.setSecurityNamespace("chess-v2"))
  .buildNetworks((builder) =>
    builder
      .addNetwork({ name: "ntp", type: ConfigNetworkType.NTP, startTime: new Date().getTime(), blockTimeMS: 1000 })
      .addNetwork({ name: "evmMain", type: ConfigNetworkType.EVM, chainId: EVM_CHAIN_ID, rpcUrl: EVM_RPC_URL })
  )
  .buildDeployments((builder) => builder)
  .buildSyncProtocols((builder) =>
    builder
      .addMain((networks) => networks.ntp, () => ({
        name: "mainNtp",
        type: ConfigSyncProtocolType.NTP_MAIN,
        chainUri: "",
        startBlockHeight: 1,
        pollingInterval: 1000,
      }))
      .addParallel((networks) => networks.evmMain, () => ({
        name: "mainEvmRPC",
        type: ConfigSyncProtocolType.EVM_RPC_PARALLEL,
        chainUri: EVM_RPC_URL,
        startBlockHeight: EVM_START_BLOCK,
        pollingInterval: 2000,
        confirmationDepth: 12,
        stepSize: 100,
      }))
  )
  .buildPrimitives((builder) =>
    builder.addPrimitive(
      (syncProtocols) => syncProtocols.mainEvmRPC,
      () => ({
        name: "Chess_EffectstreamL2",
        type: PrimitiveTypeEVMEffectstreamL2,
        startBlockHeight: EVM_START_BLOCK,
        contractAddress: EFFECTSTREAM_L2_ADDRESS,
        paimaL2Grammar: grammar,
      }),
    )
  )
  .build();
