import { setupInitialListeners } from './builtin-event-utils.ts';
import { EventManager } from './event-manager.ts';
import { toPattern } from './utils.ts';
import { extract, matches } from 'mqtt-pattern';
import { EventBrokerNames } from './types.ts';
import { getRuntime } from '@effectstream/utils/runtime';

export interface MqttClientAdapter {
  subscribe(topic: string, qos: number): Promise<void>;
  publish(topic: string, payload: string, qos: number): Promise<void>;
  connected: boolean;
}

const utf8Encoder = new TextEncoder();
const utf8Decoder = new TextDecoder();

function dispatchMessage(topic: string, payload: Uint8Array): void {
  const message = utf8Decoder.decode(payload);
  for (const [_broker, info] of Object.entries(EventManager.Instance.callbacksForTopic)) {
    for (const [pattern, callbacks] of Object.entries(info)) {
      if (matches(pattern, topic)) {
        for (const callbackInfo of Object.getOwnPropertySymbols(callbacks).map(
          sym => callbacks[sym]
        )) {
          const data: Record<string, unknown> = JSON.parse(message);
          const resolved = extract(toPattern(callbackInfo.event.path), topic);
          callbackInfo.callback({
            val: data,
            resolvedPath: resolved,
          });
        }
      }
    }
  }
}

async function createOpifexClient(url: string): Promise<MqttClientAdapter> {
  // Dynamic path prevents Vite/Rollup from tracing this Node-only import into browser bundles
  const opifexPath = '@seriousme/opifex' + '/tcpClient';
  const { TcpClient } = await import(/* @vite-ignore */ opifexPath);
  const client = new TcpClient();
  await client.connect({ url: new URL(url), numberOfRetries: 3 });

  (async () => {
    for await (const msg of client.messages()) {
      dispatchMessage(msg.topic!, new Uint8Array(msg.payload as ArrayBuffer));
    }
  })();

  const adapter: MqttClientAdapter = {
    connected: true,
    async subscribe(topic: string, qos: number) {
      await client.subscribe({
        subscriptions: [{ topicFilter: topic, qos: qos as 0 | 1 | 2 }],
      });
    },
    async publish(topic: string, payload: string, qos: number) {
      await client.publish({
        topic,
        payload: utf8Encoder.encode(payload),
        qos: qos as 0 | 1 | 2,
      });
    },
  };

  client.onConnected = () => { adapter.connected = true; };
  client.onDisconnected = () => { adapter.connected = false; };

  return adapter;
}

async function createMqttJsClient(url: string): Promise<MqttClientAdapter> {
  const mqtt = await import('mqtt');
  const client = await mqtt.default.connectAsync(url);

  client.on('message', (topic: string, message: Buffer) => {
    dispatchMessage(topic, new Uint8Array(message));
  });

  return {
    get connected() { return client.connected; },
    async subscribe(topic: string, qos: number) {
      await client.subscribeAsync(topic, { qos: qos as 0 | 1 | 2 });
    },
    async publish(topic: string, payload: string, qos: number) {
      await client.publishAsync(topic, payload, { qos: qos as 0 | 1 | 2 });
    },
  };
}

// TODO This should come from @effectstream/utils/node-env ENV
const ENV = {
  MQTT_ENGINE_BROKER_URL: 'mqtt://localhost:8883',
  MQTT_BATCHER_BROKER_URL: 'mqtt://localhost:8884',
  MQTT_ENGINE_BROKER_WS_URL: 'ws://localhost:9883',
  MQTT_BATCHER_BROKER_WS_URL: 'ws://localhost:9884',
};

export class EventConnect {
  private static clients: {
    engine?: MqttClientAdapter;
    batcher?: MqttClientAdapter;
  } = {};

  public async getClient(broker: EventBrokerNames): Promise<MqttClientAdapter | null> {
    switch (broker) {
      case EventBrokerNames.Engine:
        return await this.connectEngine();
      case EventBrokerNames.Batcher:
        return await this.connectBatcher();
    }
  }

  private async setupClient(url: string): Promise<MqttClientAdapter> {
    const runtime = getRuntime();
    if (runtime.environment === 'frontend') {
      return await createMqttJsClient(url);
    }
    return await createOpifexClient(url);
  }

  private async connectEngine(): Promise<MqttClientAdapter> {
    if (!EventConnect.clients.engine) {
      const runtime = getRuntime();
      const url = runtime.environment === 'frontend'
        ? ENV.MQTT_ENGINE_BROKER_WS_URL
        : ENV.MQTT_ENGINE_BROKER_URL;
      EventConnect.clients.engine = await this.setupClient(url);
      await setupInitialListeners(EventBrokerNames.Engine);
    }
    return EventConnect.clients.engine;
  }

  private async connectBatcher(): Promise<MqttClientAdapter> {
    if (!EventConnect.clients.batcher) {
      const runtime = getRuntime();
      const url = runtime.environment === 'frontend'
        ? ENV.MQTT_BATCHER_BROKER_WS_URL
        : ENV.MQTT_BATCHER_BROKER_URL;
      EventConnect.clients.batcher = await this.setupClient(url);
      await setupInitialListeners(EventBrokerNames.Batcher);
    }
    return EventConnect.clients.batcher;
  }
}
