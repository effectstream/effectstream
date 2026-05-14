/* eslint-disable no-console */
import { fillPath, keysForPath } from './utils.ts';
import { EventConnect } from './event-connect.ts';
import type { Static } from '@sinclair/typebox';
import type { EventPathAndDef, ResolvedPath, UserFilledPath } from './types.ts';
import { EventBrokerNames } from './types.ts';

export type CallbackArgs<Event extends EventPathAndDef> = {
  val: Static<Event['type']>;
  resolvedPath: ResolvedPath<Event['path']>;
};

export type CallbackAndMetadata<Event extends EventPathAndDef> = {
  callback: (args: CallbackArgs<Event>) => void;
  event: Event;
};

export class EventManager {
  public callbacksForTopic: Record<
    EventBrokerNames,
    Record<
      string,
      Record<symbol, CallbackAndMetadata<EventPathAndDef>>
    >
  > = {
    [EventBrokerNames.Engine]: {},
    [EventBrokerNames.Batcher]: {},
  };
  public symbolToSubscription: Record<symbol, { broker: EventBrokerNames; topic: string }> =
    {};
  static Instance: EventManager = new EventManager();

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

    try {
      await client.subscribe(topic, 2);
    } catch (err: unknown) {
      console.log(`MQTT[${args.topic.broker}] ERROR`, err);
    }

    const symbol = Symbol(topic);
    this.symbolToSubscription[symbol] = {
      broker: args.topic.broker,
      topic,
    };

    const callbacksForTopic = this.callbacksForTopic[args.topic.broker][topic] ?? {};
    callbacksForTopic[symbol] = {
      callback: callback as any,
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
    const numCallbacks = Object.keys(callbacks).length - 1;

    if (numCallbacks === 0) {
      delete this.callbacksForTopic[broker][topic];
    }
  }

  public async sendMessage<Event extends EventPathAndDef>(
    topic: Event,
    event: ResolvedPath<Event['path']> & Static<Event['type']>
  ): Promise<void> {
    const filterKeys = new Set(keysForPath(topic.path));

    const filter = Object.fromEntries(
      Object.entries(event).filter(([key, _]) => filterKeys.has(key))
    ) as ResolvedPath<Event['path']>;

    const message = Object.fromEntries(
      Object.entries(event).filter(([key, _]) => !filterKeys.has(key))
    ) as Static<Event['type']>;

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
    await client.publish(topicPath, JSON.stringify(message), 2);
  }
}
