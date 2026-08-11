export const NETWORK = {
  networkId: 'stagenet',
  nodeUrl: 'wss://rpc.stagenet.shielded.tools',
  indexerHttpUrl: 'https://indexer.stagenet.shielded.tools/api/v4/graphql',
  indexerWsUrl: 'wss://indexer.stagenet.shielded.tools/api/v4/graphql/ws',
  faucetUrl: 'https://faucet.stagenet.shielded.tools/api/drips',
} as const;

export type NodeObservation = {
  chain: string;
  nodeVersion: string;
  specVersion: number;
  transactionVersion: number;
  peers: number;
  isSyncing: boolean;
};

export type IndexerCapability = {
  queryContractEvents: boolean;
  subscriptionContractEvents: boolean;
  contractEventFields: string[];
  contractEventTypes: string[];
  contractEventFilterFields: string[];
  contractAddressRequired: boolean;
};

export type LiveCompatibilityObservation = {
  networkId: string;
  endpoints: typeof NETWORK;
  node: NodeObservation;
  contractEventSchemaFingerprint: string;
};

const REQUIRED_EVENT_FIELDS = [
  'contractAddress',
  'id',
  'maxId',
  'protocolVersion',
  'raw',
  'transaction',
  'transactionId',
  'version',
];

const REQUIRED_EVENT_TYPES = [
  'MiscContractEvent',
  'PausedEvent',
  'ShieldedBurnEvent',
  'ShieldedMintEvent',
  'ShieldedReceiveEvent',
  'ShieldedSpendEvent',
  'UnpausedEvent',
  'UnshieldedBurnEvent',
  'UnshieldedMintEvent',
  'UnshieldedReceiveEvent',
  'UnshieldedSpendEvent',
];

const REQUIRED_FILTER_FIELDS = [
  'contractAddress',
  'fieldPrefixes',
  'fromBlock',
  'toBlock',
  'transactionHash',
  'types',
];

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

export function validateNodeObservation(observation: NodeObservation): void {
  assert(observation.chain === 'Midnight Stagenet', `Unexpected chain: ${observation.chain}`);
  assert(/^2\./.test(observation.nodeVersion), `Unexpected node version: ${observation.nodeVersion}`);
  assert(observation.specVersion === 2_000_000, `Unexpected spec version: ${observation.specVersion}`);
  assert(observation.transactionVersion === 4, `Unexpected transaction version: ${observation.transactionVersion}`);
  assert(Number.isInteger(observation.peers) && observation.peers >= 0, 'Invalid peer count');
  assert(observation.isSyncing === false, 'Hosted node is still syncing');
}

export function extractIndexerCapability(payload: unknown): IndexerCapability {
  const data = (payload as { data?: Record<string, any> }).data;
  assert(data, 'Indexer response is missing data');

  const queryFields = data.queryType?.fields?.map((field: { name: string }) => field.name) ?? [];
  const subscriptionFields = data.subscriptionType?.fields?.map((field: { name: string }) => field.name) ?? [];
  const eventFields = data.contractEvent?.fields?.map((field: { name: string }) => field.name) ?? [];
  const eventTypes = data.contractEvent?.possibleTypes?.map((type: { name: string }) => type.name) ?? [];
  const filterFields = data.contractEventFilter?.inputFields?.map((field: { name: string }) => field.name) ?? [];
  const contractAddress = data.contractEventFilter?.inputFields?.find(
    (field: { name: string }) => field.name === 'contractAddress',
  );

  return {
    queryContractEvents: queryFields.includes('contractEvents'),
    subscriptionContractEvents: subscriptionFields.includes('contractEvents'),
    contractEventFields: [...eventFields].sort(),
    contractEventTypes: [...eventTypes].sort(),
    contractEventFilterFields: [...filterFields].sort(),
    contractAddressRequired: contractAddress?.type?.kind === 'NON_NULL',
  };
}

export function validateIndexerCapability(capability: IndexerCapability): void {
  assert(capability.queryContractEvents, 'API v4 query contractEvents is missing');
  assert(capability.subscriptionContractEvents, 'API v4 subscription contractEvents is missing');
  assert(capability.contractAddressRequired, 'ContractEventFilter.contractAddress is not required');
  for (const field of REQUIRED_EVENT_FIELDS) {
    assert(capability.contractEventFields.includes(field), `ContractEvent.${field} is missing`);
  }
  for (const type of REQUIRED_EVENT_TYPES) {
    assert(capability.contractEventTypes.includes(type), `ContractEvent type ${type} is missing`);
  }
  for (const field of REQUIRED_FILTER_FIELDS) {
    assert(capability.contractEventFilterFields.includes(field), `ContractEventFilter.${field} is missing`);
  }
}

export function fingerprintIndexerCapability(capability: IndexerCapability): string {
  const canonical = JSON.stringify({
    ...capability,
    contractEventFields: [...capability.contractEventFields].sort(),
    contractEventTypes: [...capability.contractEventTypes].sort(),
    contractEventFilterFields: [...capability.contractEventFilterFields].sort(),
  });
  return new Bun.CryptoHasher('sha256').update(canonical).digest('hex');
}

export function redactUrl(value: string): string {
  const url = new URL(value);
  url.username = '';
  url.password = '';
  url.search = '';
  url.hash = '';
  return url.toString();
}

export function redactEndpoints(endpoints: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(endpoints).map(([name, value]) => [
      name,
      name === 'networkId' ? value : redactUrl(value),
    ]),
  );
}

export function findCompatibilityDrift(
  lock: any,
  observation: LiveCompatibilityObservation,
): string[] {
  const drift: string[] = [];
  compare('networkId', lock.networkId, observation.networkId);
  compare('node.chain', lock.hostedObservation.chain, observation.node.chain);
  compare('node.nodeVersion', lock.hostedObservation.nodeVersion, observation.node.nodeVersion);
  compare('node.specVersion', lock.hostedObservation.specVersion, observation.node.specVersion);
  compare(
    'node.transactionVersion',
    lock.hostedObservation.transactionVersion,
    observation.node.transactionVersion,
  );
  compare(
    'indexer.contractEventSchemaFingerprint',
    lock.hostedObservation.contractEventSchemaFingerprint,
    observation.contractEventSchemaFingerprint,
  );
  for (const [name, value] of Object.entries(observation.endpoints)) {
    const expected = name === 'networkId' ? lock.networkId : lock.endpoints[name];
    compare(`endpoints.${name}`, expected, value);
  }
  return drift;

  function compare(path: string, expected: unknown, actual: unknown): void {
    if (expected !== actual) drift.push(`${path}: expected ${String(expected)}, observed ${String(actual)}`);
  }
}
