/* eslint-disable no-console */
import { fillPath, keysForPath } from './utils.ts';
import { EventConnect } from './event-connect.ts';
import type { Static } from '@sinclair/typebox';
import type { EventPathAndDef, ResolvedPath, UserFilledPath } from './types.ts';
import { EventBrokerNames } from './types.ts';

export type CallbackArgs<Event extends EventPathAndDef> = {
  // schema of the content emitted
  // ex: block/5 -> block content
  val: Static<Event['type']>;
  // resolution of the variables specified in the topic name
  // ex: block/5 -> { blockId: 5 }
  resolvedPath: ResolvedPath<Event['path']>;
};

export type CallbackAndMetadata<Event extends EventPathAndDef> = {
  // note: explicitly not async since we need it to be sync to guarantee ordering in MQTT.js (as far as I can tell)
  callback: (args: CallbackArgs<Event>) => void;
  event: Event;
};

/*
 * This class subscribes to specific topics, and stores the callbacks for event processing.
 */
export class EventManager {
  public callbacksForTopic: Record<
    EventBrokerNames,
    Record<
      string, // topic
      Record<symbol, CallbackAndMetadata<EventPathAndDef>>
    >
  > = {
    [EventBrokerNames.Engine]: {},
    [EventBrokerNames.Batcher]: {},
  };
  public symbolToSubscription: Record<symbol, { broker: EventBrokerNames; topic: string }> =
    {};
  static Instance: EventManager = new EventManager();

  constructor() {
    // TODO: replace once TS5 decorators are better supported
    this.subscribe.bind(this);
    this.subscribeExplicit.bind(this);
    this.unsubscribe.bind(this);
    this.sendMessage.bind(this);
    this.sendMessageExplicit.bind(this);
  }

  /**
   * Subscribe to events for a topic filtered by a set of indexed variables
   * @param broker
   * @param filter a filter to generate the MQTT topic syntax to monitor for new events
   * @param callback a callback to call when a message matching this topic is encountered
   * @returns a unique symbol to use to unsubscribe the specific callback
   */
  public async subscribe<Event extends EventPathAndDef>(
    args: {
      topic: Event;
      filter: UserFilledPath<Event['path']>;
    },
    callback: (args: Static<Event['type']> & ResolvedPath<Event['path']>) => void
  ): Promise<symbol> {
    return await this.subscribeExplicit<Event>(
      {
        topic: args.topic,
        filter: args.filter,
      },
      ({ val, resolvedPath }) => callback({ ...val, ...resolvedPath })
    );
  }
  /**
   * Subscribe to events for a topic filtered by a set of indexed variables
   *
   * This is an explicit version of the `subscribe` function
   * by explicit, it means MQTT topic vars and content are treated differently
   * this is worse devx, but supports cases where topic & content have vars with overlapping names
   * @param broker
   * @param filter a filter to generate the MQTT topic syntax to monitor for new events
   * @param callback a callback to call when a message matching this topic is encountered
   * @returns a unique symbol to use to unsubscribe the specific callback
   */
  public async subscribeExplicit<Event extends EventPathAndDef>(
    args: {
      topic: Event;
      filter: UserFilledPath<Event['path']>;
    },
    callback: (args: CallbackArgs<Event>) => void
  ): Promise<symbol> {
    const client = await new EventConnect().getClient(args.topic.broker);
    if (!client) return Symbol('noop');
    const topic = fillPath(args.topic.path, args.filter);

    const clientSubscribe = async (): Promise<void> => {
      try {
        await client.subscribeAsync(topic, { qos: 2 });
      } catch (err: unknown) {
        console.log(`MQTT[${args.topic.broker}] ERROR`, err);
      }
    };

    if (client.connected) await clientSubscribe();
    else
      await new Promise<void>(resolve => {
        // eslint-disable-next-line @typescript-eslint/no-misused-promises
        client.on('connect', async () => {
          await clientSubscribe();
          resolve();
        });
      });

    // keep track of a unique symbol for the subscription that can be used to unsubscribe later
    const symbol = Symbol(topic);
    this.symbolToSubscription[symbol] = {
      broker: args.topic.broker,
      topic,
    };

    const callbacksForTopic = this.callbacksForTopic[args.topic.broker][topic] ?? {};
    callbacksForTopic[symbol] = {
      // in practice, casting to any shouldn't be problem
      // since callbacks are only called for specific topics where we know the type matches
      callback: callback as any, // eslint-disable-line @typescript-eslint/no-explicit-any
      event: args.topic,
    };
    this.callbacksForTopic[args.topic.broker][topic] = callbacksForTopic;

    return symbol;
  }

  public async unsubscribe(event: symbol): Promise<void> {
    const { topic, broker } = this.symbolToSubscription[event];
    if (topic == null) {
      console.error('Subscription not found', event.description);
      return;
    }
    delete this.symbolToSubscription[event];

    const callbacks = this.callbacksForTopic[broker][topic];
    delete callbacks[event];
    const numCallbacks = Object.keys(callbacks).length - 1; // objs are small, so this is fast enough in practice

    // if there are no references left to this topic, we can unsubscribe from it
    if (numCallbacks === 0) {
      const client = await new EventConnect().getClient(broker);
      delete this.callbacksForTopic[broker][topic];
      if (!client) return;

      const clientUnsubscribe = async (): Promise<void> => {
        try {
          await client.unsubscribeAsync(topic);
        } catch (err: unknown) {
          console.log(`MQTT[${broker}] ERROR`, err);
        }
      };

      if (client.connected) await clientUnsubscribe();
      else
        await new Promise<void>(resolve => {
          // eslint-disable-next-line @typescript-eslint/no-misused-promises
          client.on('connect', async () => {
            await clientUnsubscribe();
            resolve();
          });
        });
    }
  }

  public async sendMessage<Event extends EventPathAndDef>(
    topic: Event,
    event: ResolvedPath<Event['path']> & Static<Event['type']>
  ): Promise<void> {
    const filterKeys = new Set(keysForPath(topic.path));

    const filter = Object.fromEntries(
      Object.entries(event).filter(([key, _]) => filterKeys.has(key))
    ) as ResolvedPath<Event['path']>; // typescript can't know this filter actually matches the static type

    const message = Object.fromEntries(
      Object.entries(event).filter(([key, _]) => !filterKeys.has(key))
    ) as Static<Event['type']>; // typescript can't know this filter actually matches the static type

    return await this.sendMessageExplicit<Event>({ topic, filter }, message);
  }
  public async sendMessageExplicit<Event extends EventPathAndDef>(
    args: {
      topic: Event;
      filter: ResolvedPath<Event['path']>;
    },
    message: Static<Event['type']>
  ): Promise<void> {
    const client = await new EventConnect().getClient(args.topic.broker);
    if (!client) return;
    const topicPath = fillPath(args.topic.path, args.filter);
    await client.publishAsync(topicPath, JSON.stringify(message), { qos: 2 });
  }
}
