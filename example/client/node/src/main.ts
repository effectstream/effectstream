import { init, start } from "@paima/runtime";
import { main, suspend } from "effection";
import { localhostConfig } from "@example/data-types";
import {
  type SyncProtocolWithNetwork,
  withPaimaStaticConfig,
} from "@paima/config";

main(function* () {
  yield* init();
  console.log("starting node");

  yield* withPaimaStaticConfig(localhostConfig, function* () {
    yield* start(
      [
        // TODO: clean up this code so it's more readable
        {
          networkType: localhostConfig.allNetworks
            .networks[localhostConfig.syncProtocols.main.network].type,
          syncProtocolType:
            localhostConfig.syncProtocols.main.syncProtocol.type,
          syncProtocol: localhostConfig.syncProtocols.main.syncProtocol,
          network: localhostConfig.allNetworks
            .networks[localhostConfig.syncProtocols.main.network],
        },
        ...Object.values(localhostConfig.syncProtocols.parallel).map((
          protocol,
        ) => {
          const network =
            localhostConfig.allNetworks.networks[protocol.network];
          const result = {
            networkType: network.type,
            syncProtocolType: protocol.syncProtocol.type,
            syncProtocol: protocol.syncProtocol,
            network,
          };
          return result as SyncProtocolWithNetwork;
        }),
        // TODO: decorator funnels
      ],
    );
  });

  yield* suspend();
});
