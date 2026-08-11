import {
  NETWORK,
  extractIndexerCapability,
  findCompatibilityDrift,
  fingerprintIndexerCapability,
  redactEndpoints,
  redactUrl,
  validateIndexerCapability,
  validateNodeObservation,
  type NodeObservation,
} from './compatibility';

const timeoutMs = 15_000;

const [nodeProbe, indexerPayload, indexerWs, faucet, latestIndexerBlock] = await Promise.all([
  probeNode(),
  probeIndexerHttp(),
  probeIndexerWs(),
  probeFaucetOptions(),
  probeIndexerBlock(),
]);
const node = nodeProbe.observation;

const [pinnedNodeHash, pinnedIndexerBlock] = await Promise.all([
  probeNodeBlockHash(nodeProbe.latestBlockHeight),
  probeIndexerBlock(latestIndexerBlock.height),
]);
if (pinnedNodeHash !== nodeProbe.latestBlockHash) {
  throw new Error('Pinned node block hash differs from the observed latest header');
}
if (
  pinnedIndexerBlock.height !== latestIndexerBlock.height ||
  pinnedIndexerBlock.hash !== latestIndexerBlock.hash ||
  pinnedIndexerBlock.protocolVersion !== 2_000_000
) {
  throw new Error('Pinned indexer block differs from the observed latest block');
}

validateNodeObservation(node);
const indexer = extractIndexerCapability(indexerPayload);
validateIndexerCapability(indexer);
const schemaFingerprint = fingerprintIndexerCapability(indexer);

const lock = await Bun.file('/app/compatibility-lock.json').json();
const drift = findCompatibilityDrift(lock, {
  networkId: NETWORK.networkId,
  endpoints: NETWORK,
  node,
  contractEventSchemaFingerprint: schemaFingerprint,
});
if (drift.length > 0) throw new Error(`Hosted compatibility drift:\n${drift.join('\n')}`);

console.log(
  JSON.stringify({
    checkpoint: 'C17-live-read',
    networkId: NETWORK.networkId,
    endpoints: redactEndpoints(NETWORK),
    node,
    indexer: { schemaFingerprint, contractEventTypes: indexer.contractEventTypes },
    blocks: {
      node: { height: nodeProbe.latestBlockHeight, hash: nodeProbe.latestBlockHash, pinned: true },
      indexer: { ...latestIndexerBlock, pinned: true },
    },
    indexerWs,
    faucet,
    status: 'pass',
  }),
);

async function probeNode(): Promise<{
  observation: NodeObservation;
  latestBlockHeight: number;
  latestBlockHash: string;
}> {
  const socket = await openSocket(NETWORK.nodeUrl);
  try {
    const results = await rpcBatch(socket, [
      'system_chain',
      'system_version',
      'state_getRuntimeVersion',
      'system_health',
      'chain_getHeader',
    ]);
    const runtime = results.state_getRuntimeVersion as {
      specVersion: number;
      transactionVersion: number;
    };
    const health = results.system_health as { peers: number; isSyncing: boolean };
    const header = results.chain_getHeader as { number: string; hash?: string };
    const latestBlockHeight = Number.parseInt(header.number, 16);
    if (!Number.isSafeInteger(latestBlockHeight) || latestBlockHeight < 1) {
      throw new Error(`Node returned an invalid latest block height: ${header.number}`);
    }
    const latestBlockHash = await rpcCall(socket, 'chain_getBlockHash', [latestBlockHeight]);
    return {
      observation: {
        chain: results.system_chain as string,
        nodeVersion: results.system_version as string,
        specVersion: runtime.specVersion,
        transactionVersion: runtime.transactionVersion,
        peers: health.peers,
        isSyncing: health.isSyncing,
      },
      latestBlockHeight,
      latestBlockHash: String(latestBlockHash),
    };
  } finally {
    socket.close();
  }
}

async function probeNodeBlockHash(height: number): Promise<string> {
  const socket = await openSocket(NETWORK.nodeUrl);
  try {
    return String(await rpcCall(socket, 'chain_getBlockHash', [height]));
  } finally {
    socket.close();
  }
}

async function probeIndexerBlock(height?: number): Promise<{
  hash: string;
  height: number;
  protocolVersion: number;
}> {
  const offset = height === undefined ? '' : `(offset: { height: ${height} })`;
  const response = await fetch(NETWORK.indexerHttpUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      query: `query C17BlockProbe { block${offset} { hash height protocolVersion } }`,
    }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const payload = await response.json() as {
    data?: { block?: { hash?: string; height?: number; protocolVersion?: number } };
    errors?: unknown[];
  };
  const block = payload.data?.block;
  if (
    !response.ok || payload.errors?.length || typeof block?.hash !== 'string' ||
    !Number.isSafeInteger(block.height) || !Number.isSafeInteger(block.protocolVersion)
  ) {
    throw new Error(`Indexer ${height === undefined ? 'latest' : 'pinned'} block probe failed`);
  }
  return block as { hash: string; height: number; protocolVersion: number };
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

async function rpcCall(socket: WebSocket, method: string, params: unknown[]): Promise<unknown> {
  return await new Promise((resolve, reject) => {
    const id = 10_001;
    const timer = setTimeout(() => reject(new Error(`Node RPC ${method} timed out`)), timeoutMs);
    socket.addEventListener('message', (event) => {
      const response = JSON.parse(String(event.data)) as {
        id?: number;
        result?: unknown;
        error?: { message?: string };
      };
      if (response.id !== id) return;
      clearTimeout(timer);
      if (response.error) reject(new Error(`Node RPC ${method} failed: ${response.error.message ?? 'unknown'}`));
      else resolve(response.result);
    });
    socket.send(JSON.stringify({ jsonrpc: '2.0', id, method, params }));
  });
}
