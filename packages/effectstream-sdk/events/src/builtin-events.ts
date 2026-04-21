import { Type } from '@sinclair/typebox';
import type { EventAddHashFields, EventPathAndDef, LogEvent, LogEventFields } from './types.ts';
import { addHashes, genEvent, EventBrokerNames, toPath, TopicPrefix } from './types.ts';
import type {
  Operations,
  Channels,
  ChannelMessages,
  Parameters,
  AsyncAPI300Schema,
  Parameter,
} from './asyncapi.ts';

import type { TLiteral, TSchema } from '@sinclair/typebox';

// careful: the most steps you add, the more responsive, but also the slower
//          since status updates themselves need to be sent over the network
export enum BatcherStatus {
  Posting = 'posting',
  /**
   * note: it's entirely possible the Paima Engine node finds and processes the block before the batcher notifies it got posted
   *       so you may get a node/block event before receiving a Finalizing event
   */
  Finalizing = 'finalizing',
  /**
   * after waiting X blocks (X depends on the batcher configuration)
   * note: it's entirely possible the Paima Engine node finds and processes the block before the batcher finds it
   *       so you may get a node/block event before receiving a Finalized event
   */
  Finalized = 'finalized',
  Rejected = 'rejected',
}
const BatcherHash = genEvent({
  name: 'BatcherHash',
  fields: [
    {
      name: 'batch', // batch hash
      type: Type.String(),
      indexed: true,
    },
    {
      name: 'status',
      type: Type.Enum(BatcherStatus),
      indexed: true,
    },
    {
      name: 'blockHeight',
      type: Type.Optional(Type.Integer()),
    },
    {
      name: 'transactionHash',
      type: Type.String(),
    },
  ],
});

const RollupBlock = genEvent({
  name: 'RollupBlock',
  fields: [
    {
      name: 'block', // block height
      type: Type.Integer(),
      indexed: true,
    },
    {
      name: 'timestamp',
      type: Type.Optional(Type.Integer()),
    },
  ],
});

const SyncChains = genEvent({
  name: 'SyncChains',
  fields: [
    {
      name: 'chain',
      type: Type.String(),
      indexed: true,
    },
    {
      name: 'block',
      type: Type.Integer(),
      indexed: true,
    },
    {
      name: 'rollup',
      type: Type.Integer(),
      indexed: false,
    }
  ],
});

const Events = [
  [TopicPrefix.Batcher, BatcherHash],
  [TopicPrefix.Node, RollupBlock],
  [TopicPrefix.Node, SyncChains],
] as const;

export const toPathFromEntries = <
  const T extends ReadonlyArray<readonly [TopicPrefix, LogEvent<LogEventFields<TSchema>[]>]>,
>(
  entries: T
): { [K in T[number] as K[1]['name']]: ReturnType<typeof toPath<K[1], K[0]>> } => {
  let result: Record<string, any> = {}; // we can't know the type here
  for (const event of entries) {
    result[event[1].name] = toPath(event[0], event[1]);
  }
  return result as any;
};
export const toPathWithHashFromEntries = <
  const T extends ReadonlyArray<readonly [TopicPrefix, LogEvent<LogEventFields<TSchema>[]>]>,
>(
  entries: T
): {
  [K in T[number] as K[1]['name']]: ReturnType<typeof toPath<EventAddHashFields<K[1]>, K[0]>>;
} => {
  let result: Record<string, any> = {}; // we can't know the type here
  for (const event of entries) {
    result[event[1].name] = toPath(event[0], addHashes(event[1]));
  }
  return result as any;
};

export const BuiltinEvents = toPathFromEntries(Events) satisfies Record<string, EventPathAndDef>;
export const BuiltinHashedEvents = toPathWithHashFromEntries(Events) satisfies Record<
  string,
  EventPathAndDef
>;

type HostInfo = {
  backendUri: string;
  batcherUri?: string;
};
export function toAsyncApi(info: HostInfo, events: [string, EventPathAndDef][]): AsyncAPI300Schema {
  const parsedUrl = new URL(info.backendUri);
  const servers: NonNullable<AsyncAPI300Schema['servers']> = {
    [EventBrokerNames.Engine]: {
      host: parsedUrl.host,
      // cut off trailing `:`
      protocol: parsedUrl.protocol.substring(0, parsedUrl.protocol.length - 1),
      title: 'Paima Engine node MQTT broker',
    },
  };
  if (info.batcherUri != null) {
    const parsedBatcherUrl = new URL(info.batcherUri);
    servers[EventBrokerNames.Batcher] = {
      host: parsedBatcherUrl.host,
      // cut off trailing `:`
      protocol: parsedBatcherUrl.protocol.substring(0, parsedUrl.protocol.length - 1),
      summary: 'Paima Engine batcher MQTT broker',
    };
  }

  const channels: Channels = {};
  for (const [k, v] of events) {
    if (v.broker === EventBrokerNames.Batcher && info.batcherUri == null) {
      continue;
    }
    const parameters: Parameters = {};
    for (const param of v.path) {
      if (typeof param === 'string') continue;
      const parameter: Parameter = {
        // description: 'todo',
      };
      if ('anyOf' in param.type) {
        parameter.enum = param.type.anyOf.map((entry: TLiteral<string>) => entry.const);
      }
      parameters[param.name] = parameter;
    }

    const messages: ChannelMessages = {
      content: {
        payload: v.type,
        contentType: 'application/json',
      },
    };

    channels[`on${k}`] = {
      address: v.path.map(path => (typeof path === 'string' ? path : `{${path.name}}`)).join('/'),
      messages,
      parameters,
      servers: [
        {
          $ref: `#/servers/${v.broker}`,
        },
      ],
      // description: 'todo',
    };
  }

  const operations: Operations = {};
  for (const [k, v] of events) {
    if (v.broker === EventBrokerNames.Batcher && info.batcherUri == null) {
      continue;
    }
    operations[`receive${k}`] = {
      action: 'receive',
      channel: {
        $ref: `#/channels/on${k}`,
      },
      traits: [
        {
          $ref: '#/components/operationTraits/mqtt',
        },
      ],
    };
  }
  const definition: AsyncAPI300Schema = {
    asyncapi: '3.0.0',
    info: {
      title: 'Paima MQTT API',
      version: '1.0.0',
      description: 'Documentation for the MQTT channels for this Paima node',
      externalDocs: {
        description: 'Official Paima Engine documentation',
        url: 'https://effectstream.github.io/docs',
      },
    },
    defaultContentType: 'application/json',
    servers,
    channels,
    operations,
    components: {
      operationTraits: {
        mqtt: {
          bindings: {
            mqtt: {
              qos: 2,
            },
          },
        },
      },
    },
  };
  return definition;
}
