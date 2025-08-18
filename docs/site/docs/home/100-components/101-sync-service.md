# Sync Service & Chain Config

This is the main `Paima Engine` service, it syncs the different blockchains, scans and captures the events, calls, executes the state machine.

This service is setup by the Chain & Contracts configuration.

```ts
export const localhostConfig = new ConfigBuilder()
  .setNamespace(builder => builder.setSecurityNamespace("my-app-track-erc721"))
  .buildNetworks(builder => 
    builder.addViemNetwork({
        ...hardhat,
        name: "evmMain",
    })
  )
  .buildSyncProtocols(builder =>
   builder.addMain(
        (networks) => networks.evmMain, 
        (network, deployments) => ({
            name: "mainEvmRPC",
            type: ConfigSyncProtocolType.EVM_RPC_MAIN,
            chainUri: network.rpcUrls.default.http[0],
            startBlockHeight: 1,
            pollingInterval: 500,
        })
    )
  )
  .buildPrimitives(builder =>
    builder.addPrimitive(
        (syncProtocols) => syncProtocols.mainEvmRPC,
        (network, deployments, syncProtocol) => ({
          name: "Track-ERC721",
          type: ConfigPrimitiveType.EvmRpcERC721,
          startBlockHeight: 0,
          contractAddress:
            contractAddressesEvmMain().chain31337["Erc721DevModule#Erc721Dev"],
          abi: getEvmEvent(
            erc721dev.abi,
            "Transfer(address,address,uint256)",
          ),
          scheduledPrefix: "transfer-assets",
        })
    )
  )
  .build();
```