import {
  NETWORK,
  extractIndexerCapability,
  fingerprintIndexerCapability,
  redactUrl,
  validateIndexerCapability,
  validateNodeObservation,
  type NodeObservation,
} from './compatibility';

const timeoutMs = 15_000;

const [node, indexerPayload, indexerWs, faucet] = await Promise.all([
  probeNode(),
  probeIndexerHttp(),
  probeIndexerWs(),
  probeFaucetOptions(),
]);

validateNodeObservation(node);
const indexer = extractIndexerCapability(indexerPayload);
validateIndexerCapability(indexer);
const schemaFingerprint = fingerprintIndexerCapability(indexer);

const lock = await Bun.file('/app/compatibility-lock.json').json();
if (lock.networkId !== NETWORK.networkId) throw new Error('Compatibility lock network ID drifted');
if (node.nodeVersion !== lock.hostedObservation.nodeVersion) {
  throw new Error(
    `Hosted node version drift: expected ${lock.hostedObservation.nodeVersion}, observed ${node.nodeVersion}`,
  );
}
if (lock.hostedObservation.contractEventSchemaFingerprint !== schemaFingerprint) {
  throw new Error(
    `Contract-event schema drift: expected ${lock.hostedObservation.contractEventSchemaFingerprint}, observed ${schemaFingerprint}`,
  );
}

console.log(
  JSON.stringify({
    checkpoint: 'C02-live-read',
    networkId: NETWORK.networkId,
    endpoints: {
      node: redactUrl(NETWORK.nodeUrl),
      indexerHttp: redactUrl(NETWORK.indexerHttpUrl),
      indexerWs: redactUrl(NETWORK.indexerWsUrl),
      faucet: redactUrl(NETWORK.faucetUrl),
    },
    node,
    indexer: { schemaFingerprint, contractEventTypes: indexer.contractEventTypes },
    indexerWs,
    faucet,
    status: 'pass',
  }),
);

async function probeNode(): Promise<NodeObservation> {
  const socket = await openSocket(NETWORK.nodeUrl);
  try {
    const results = await rpcBatch(socket, [
      'system_chain',
      'system_version',
      'state_getRuntimeVersion',
      'system_health',
    ]);
    const runtime = results.state_getRuntimeVersion as {
      specVersion: number;
      transactionVersion: number;
    };
    const health = results.system_health as { peers: number; isSyncing: boolean };
    return {
      chain: results.system_chain as string,
      nodeVersion: results.system_version as string,
      specVersion: runtime.specVersion,
      transactionVersion: runtime.transactionVersion,
      peers: health.peers,
      isSyncing: health.isSyncing,
    };
  } finally {
    socket.close();
  }
}

async function probeIndexerHttp(): Promise<unknown> {
  const query = `query CompatibilityProbe {
    queryType: __type(name: "Query") { fields { name } }
    subscriptionType: __type(name: "Subscription") { fields { name } }
    contractEvent: __type(name: "ContractEvent") { fields { name } possibleTypes { name } }
    contractEventFilter: __type(name: "ContractEventFilter") {
      inputFields { name type { kind name ofType { kind name } } }
    }
  }`;
  const response = await fetch(NETWORK.indexerHttpUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ query }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) throw new Error(`Indexer HTTP probe failed with status ${response.status}`);
  const payload = await response.json();
  if ((payload as { errors?: unknown[] }).errors?.length) throw new Error('Indexer introspection returned errors');
  return payload;
}

async function probeIndexerWs(): Promise<{ protocol: string; acknowledged: true }> {
  const socket = await openSocket(NETWORK.indexerWsUrl, 'graphql-transport-ws');
  try {
    const acknowledged = new Promise<true>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Indexer WebSocket acknowledgement timed out')), timeoutMs);
      socket.addEventListener(
        'message',
        (event) => {
          const message = JSON.parse(String(event.data)) as { type?: string };
          if (message.type === 'connection_ack') {
            clearTimeout(timer);
            resolve(true);
          }
        },
      );
    });
    socket.send(JSON.stringify({ type: 'connection_init' }));
    await acknowledged;
    return { protocol: socket.protocol, acknowledged: true };
  } finally {
    socket.close();
  }
}

async function probeFaucetOptions(): Promise<{ method: 'OPTIONS'; status: number }> {
  const response = await fetch(NETWORK.faucetUrl, {
    method: 'OPTIONS',
    redirect: 'error',
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (response.status !== 204) throw new Error(`Unexpected faucet OPTIONS status: ${response.status}`);
  return { method: 'OPTIONS', status: response.status };
}

async function openSocket(url: string, protocol?: string): Promise<WebSocket> {
  return await new Promise<WebSocket>((resolve, reject) => {
    const socket = protocol ? new WebSocket(url, protocol) : new WebSocket(url);
    const timer = setTimeout(() => {
      socket.close();
      reject(new Error(`WebSocket connection timed out: ${redactUrl(url)}`));
    }, timeoutMs);
    socket.addEventListener('open', () => {
      clearTimeout(timer);
      resolve(socket);
    });
    socket.addEventListener('error', () => {
      clearTimeout(timer);
      reject(new Error(`WebSocket connection failed: ${redactUrl(url)}`));
    });
  });
}

async function rpcBatch(socket: WebSocket, methods: string[]): Promise<Record<string, unknown>> {
  return await new Promise((resolve, reject) => {
    const byId = new Map<number, string>();
    const results: Record<string, unknown> = {};
    const timer = setTimeout(() => reject(new Error('Node RPC probe timed out')), timeoutMs);
    socket.addEventListener('message', (event) => {
      const response = JSON.parse(String(event.data)) as {
        id?: number;
        result?: unknown;
        error?: { message?: string };
      };
      if (response.id === undefined || !byId.has(response.id)) return;
      if (response.error) {
        clearTimeout(timer);
        reject(new Error(`Node RPC failed: ${response.error.message ?? 'unknown error'}`));
        return;
      }
      results[byId.get(response.id)!] = response.result;
      if (Object.keys(results).length === methods.length) {
        clearTimeout(timer);
        resolve(results);
      }
    });
    methods.forEach((method, index) => {
      const id = index + 1;
      byId.set(id, method);
      socket.send(JSON.stringify({ jsonrpc: '2.0', id, method, params: [] }));
    });
  });
}
