export type MidnightV2NetworkProfile = Readonly<{
  networkId: 'stagenet';
  nodeUrl: string;
  indexerHttpUrl: string;
  indexerWsUrl: string;
  proofServerUrl: string;
  faucetUrl: string;
}>;

export type Environment = Readonly<Record<string, string | undefined>>;

export const STAGENET_PROFILE_DEFAULTS: MidnightV2NetworkProfile = Object.freeze({
  networkId: 'stagenet',
  nodeUrl: 'wss://rpc.stagenet.shielded.tools',
  indexerHttpUrl: 'https://indexer.stagenet.shielded.tools/api/v4/graphql',
  indexerWsUrl: 'wss://indexer.stagenet.shielded.tools/api/v4/graphql/ws',
  proofServerUrl: 'http://proof-server-experimental:6300',
  faucetUrl: 'https://faucet.stagenet.shielded.tools/api/drips',
});

export const NETWORK_PROFILE_OVERRIDE_PRECEDENCE = Object.freeze({
  networkId: ['MIDNIGHT_V2_NETWORK_ID', 'MIDNIGHT_NETWORK_ID'],
  nodeUrl: ['MIDNIGHT_V2_NODE_URL', 'MIDNIGHT_NODE_URL'],
  indexerHttpUrl: ['MIDNIGHT_V2_INDEXER_HTTP_URL', 'MIDNIGHT_INDEXER_HTTP'],
  indexerWsUrl: ['MIDNIGHT_V2_INDEXER_WS_URL', 'MIDNIGHT_INDEXER_WS'],
  proofServerUrl: ['MIDNIGHT_V2_PROOF_SERVER_URL', 'MIDNIGHT_PROOF_SERVER_URL', 'MIDNIGHT_PROOF_SERVER'],
  faucetUrl: ['MIDNIGHT_V2_FAUCET_URL', 'MIDNIGHT_FAUCET_URL'],
} as const);

export function resolveStagenetProfile(environment: Environment = process.env): MidnightV2NetworkProfile {
  const candidate = Object.fromEntries(
    Object.entries(NETWORK_PROFILE_OVERRIDE_PRECEDENCE).map(([field, keys]) => [
      field,
      firstNonEmpty(environment, keys) ?? STAGENET_PROFILE_DEFAULTS[field as keyof MidnightV2NetworkProfile],
    ]),
  );
  return validateNetworkProfile(candidate);
}

export function validateNetworkProfile(candidate: unknown): MidnightV2NetworkProfile {
  if (!candidate || typeof candidate !== 'object') throw new Error('Midnight v2 network profile must be an object');
  const value = candidate as Record<string, unknown>;
  if (value.networkId !== 'stagenet') {
    throw new Error(`networkId must be stagenet; received ${redactValue(value.networkId)}`);
  }

  const profile = {
    networkId: 'stagenet' as const,
    nodeUrl: requiredString(value, 'nodeUrl'),
    indexerHttpUrl: requiredString(value, 'indexerHttpUrl'),
    indexerWsUrl: requiredString(value, 'indexerWsUrl'),
    proofServerUrl: requiredString(value, 'proofServerUrl'),
    faucetUrl: requiredString(value, 'faucetUrl'),
  };

  validateEndpoint('nodeUrl', profile.nodeUrl, ['wss:', 'ws:']);
  validateEndpoint('indexerHttpUrl', profile.indexerHttpUrl, ['https:', 'http:']);
  validateEndpoint('indexerWsUrl', profile.indexerWsUrl, ['wss:', 'ws:']);
  validateEndpoint('proofServerUrl', profile.proofServerUrl, ['https:', 'http:']);
  validateEndpoint('faucetUrl', profile.faucetUrl, ['https:', 'http:']);
  return Object.freeze(profile);
}

export function redactUrl(value: string): string {
  try {
    const url = new URL(value);
    return `${url.protocol}//${url.hostname}${url.port ? `:${url.port}` : ''}${url.pathname}`;
  } catch {
    return '<invalid-url>';
  }
}

function firstNonEmpty(environment: Environment, keys: readonly string[]): string | undefined {
  for (const key of keys) {
    const value = environment[key]?.trim();
    if (value) return value;
  }
  return undefined;
}

function requiredString(value: Record<string, unknown>, field: string): string {
  const candidate = value[field];
  if (typeof candidate !== 'string' || candidate.trim() === '') {
    throw new Error(`${field} is required`);
  }
  return candidate.trim();
}

function validateEndpoint(field: string, value: string, protocols: readonly string[]): void {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${field} is malformed: ${redactUrl(value)}`);
  }
  const redacted = redactUrl(value);
  if (!protocols.includes(url.protocol)) {
    throw new Error(`${field} uses an unsupported protocol: ${redacted}`);
  }
  if (url.username || url.password) throw new Error(`${field} must not contain credentials: ${redacted}`);
  if (url.search || url.hash) throw new Error(`${field} must not contain query or fragment data: ${redacted}`);
  if (
    (url.protocol === 'http:' || url.protocol === 'ws:') &&
    !isTrustedPlaintextEndpoint(field, url.hostname)
  ) {
    throw new Error(`${field} must use transport security outside loopback: ${redacted}`);
  }
}

function isTrustedPlaintextEndpoint(field: string, hostname: string): boolean {
  return isLoopback(hostname) || (field === 'proofServerUrl' && hostname === 'proof-server-experimental');
}

function isLoopback(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]';
}

function redactValue(value: unknown): string {
  return typeof value === 'string' && value.includes('://') ? redactUrl(value) : '<redacted>';
}
