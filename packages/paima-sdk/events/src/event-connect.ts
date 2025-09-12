import mqtt from 'mqtt';
import { setupInitialListeners } from './builtin-event-utils.ts';
import { PaimaEventManager } from './event-manager.ts';
import { toPattern } from './utils.ts';
import { extract, matches } from 'mqtt-pattern';
import { PaimaEventBrokerNames } from './types.ts';
import type { Buffer } from "node:buffer";

// TODO This should come from @paima/utils/node-env ENV
const ENV = { 
  MQTT_ENGINE_BROKER_URL: 'ws://localhost:8883',
  MQTT_BATCHER_BROKER_URL: 'ws://localhost:8884',
}
/*
 * Paima Event Connector
 * Called automatically by listeners and published when needed.
 */
export class PaimaEventConnect {
  // clients
  private static clients: {
    engine?: mqtt.MqttClient;
    batcher?: mqtt.MqttClient;
  } = {};

  constructor() {
    // TODO: replace once TS5 decorators are better supported
    this.getClient.bind(this);
    this.setupClient.bind(this);
    this.connectPaimaEngine.bind(this);
    this.connectBatcher.bind(this);
  }

  /**
   * Get client for broker
   * note: we lazy-load the client to avoid overhead if MQTT is never used
   */
  public async getClient(broker: PaimaEventBrokerNames): Promise<mqtt.MqttClient> {
    switch (broker) {
      case PaimaEventBrokerNames.PaimaEngine: {
        return await this.connectPaimaEngine();
      }
      case PaimaEventBrokerNames.Batcher:
        return await this.connectBatcher();
    }
  }

  private async setupClient(url: string): Promise<mqtt.MqttClient> {
    const client = await mqtt.connectAsync(url);
    client.on('message', (topic: string, message: Buffer) => {
      for (const [_broker, info] of Object.entries(PaimaEventManager.Instance.callbacksForTopic)) {
        for (const [pattern, callbacks] of Object.entries(info)) {
          if (matches(pattern, topic)) {
            for (const callbackInfo of Object.getOwnPropertySymbols(callbacks).map(
              sym => callbacks[sym]
            )) {
              const data: Record<string, unknown> = JSON.parse(message.toString());

              const resolved = extract(toPattern(callbackInfo.event.path), topic);
              callbackInfo.callback({
                val: data,
                resolvedPath: resolved,
              });
            }
          }
        }
      }
    });
    return client;
  }

  private async connectPaimaEngine(): Promise<mqtt.MqttClient> {
    if (!PaimaEventConnect.clients.engine) {
      const broker = PaimaEventBrokerNames.PaimaEngine;
      PaimaEventConnect.clients.engine = await this.setupClient(ENV.MQTT_ENGINE_BROKER_URL);
      await setupInitialListeners(broker);
    }
    return PaimaEventConnect.clients.engine;
  }

  private async connectBatcher(): Promise<mqtt.MqttClient> {
    if (!PaimaEventConnect.clients.batcher) {
      const broker = PaimaEventBrokerNames.Batcher;
      PaimaEventConnect.clients.batcher = await this.setupClient(ENV.MQTT_BATCHER_BROKER_URL);
      await setupInitialListeners(broker);
    }
    return PaimaEventConnect.clients.batcher;
  }
}
