/* eslint-disable no-console */
import Aedes from 'aedes';
import type { Server } from 'aedes-server-factory';
import { createServer } from 'aedes-server-factory';
import ip from 'ip';
// import { ENV } from '@paima/utils';
// TODO We need to import this from the ENV
const ENV = {
  MQTT_BROKER: true,
  MQTT_ENGINE_BROKER_PORT: 8883,
  MQTT_BATCHER_BROKER_PORT: 8884,
}


function isLocalhost(ipAddress: string): boolean {
  // note: this only detects simple cases (ex: you're not mapping different hostnames to localhost)
  const localhostIPv4Range = ip.cidrSubnet('127.0.0.0/8');
  const localhostIPv6Range = ip.cidrSubnet('::1/128');
  const ipv4MappedIPv6LocalhostRange = ip.cidrSubnet('::ffff:127.0.0.0/104');

  return (
    localhostIPv4Range.contains(ipAddress) ||
    localhostIPv6Range.contains(ipAddress) ||
    ipv4MappedIPv6LocalhostRange.contains(ipAddress)
  );
}

/*
 * This class implements a local MQTT Broker.
 */
export class PaimaEventBroker {
  constructor(private broker: 'paima-engine' | 'Batcher') {}
  private static aedes: Aedes.default | null = null;
  private static server: Server | null = null;

  /*
   * Get & Init Server Singleton
   */
  public createServer(): Server {
    this.checkEnabled();
    if (PaimaEventBroker.server) return PaimaEventBroker.server;

    PaimaEventBroker.aedes = Aedes.createBroker();
    PaimaEventBroker.aedes.authorizePublish = (client, packet, callback): void => {

      // TODO We need to allow only localhost to publish.
      //      In deno we are getting `client?.req?.socket?.remoteAddress` as undefined.
      //
      // if (client?.req?.socket?.remoteAddress == null)
      //   return callback(
      //     new Error('Error: no remove address found for  PaimaEventBroker connection')
      // );

      /**
       * to avoid players injecting commands into the Paima Engine node
       * ex: publishing node/block/200 to try and make the node think block 200 got created
       * we only allow receiving messages that come from localhost
       *
       * recall: Paima Engine node is just one client connecting to this broker
       * note: there is no good way to different other localhost process from the Paima Engine node
       *       as they are all just localhost processes connecting to this broker
       *       so this localhost check could be stricter, but this should be sufficient
       */
      // if (isLocalhost(client?.req?.socket?.remoteAddress)) {
      return callback(null);
      // }
      // for some reason, mqtt-cli requires this topic
      // https://github.com/Anasnew99/mqtt-cli/blob/29ba08e66da397bdab16723c93b59ecb51d2da3e/src/index.ts#L158
      // if (packet.topic === '/ping_req_sys') {
      // return callback(null);
      // }
      // callback(new Error('Messages must come from localhost'));
    };

    PaimaEventBroker.server = createServer(PaimaEventBroker.aedes, { ws: true });

    // WEBSOCKET PROTOCOL SERVER
    PaimaEventBroker.server.listen(this.getPort(), () =>
      console.log('MQTT-WS Server Started at PORT ' + this.getPort())
    );
    return PaimaEventBroker.server;
  }

  private checkEnabled(): void {
    if (!ENV.MQTT_BROKER) {
      throw new Error('Local MQTT Broker is disabled.');
    }
  }

  private getPort(): number {
    switch (this.broker) {
      // TODO: use env vars without duplicating default here
      case 'paima-engine': {
        return ENV.MQTT_ENGINE_BROKER_PORT;
      }
      case 'Batcher': {
        return ENV.MQTT_BATCHER_BROKER_PORT;
      }
    }
    throw new Error('Unknown engine');
  }
}
