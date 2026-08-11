import { assertNode22, claimRuntimeLane } from './runtime-guard.mjs';

export const PROVIDER_KINDS = Object.freeze([
  'privateStateProvider',
  'publicDataProvider',
  'zkConfigProvider',
  'proofProvider',
  'walletProvider',
  'midnightProvider',
]);

export function constructV2Providers(config, factories) {
  assertNode22();
  const validated = validateProviderConfig(config);
  validateFactories(factories);
  claimRuntimeLane('ledger-v9/runtime-v4');

  return Object.freeze({
    privateStateProvider: factories.privateStateProvider(validated),
    publicDataProvider: factories.publicDataProvider(validated),
    zkConfigProvider: factories.zkConfigProvider(validated),
    proofProvider: factories.proofProvider(validated),
    walletProvider: factories.walletProvider(validated),
    midnightProvider: factories.midnightProvider(validated),
  });
}

export function validateProviderConfig(config) {
  if (!config || typeof config !== 'object') throw new Error('Midnight v2 provider config must be an object');
  if (config.networkId !== 'stagenet') throw new Error('Midnight v2 provider config requires networkId=stagenet');
  for (const field of ['nodeUrl', 'indexerHttpUrl', 'indexerWsUrl', 'proofServerUrl']) {
    if (typeof config[field] !== 'string' || config[field].trim() === '') {
      throw new Error(`Midnight v2 provider config requires ${field}`);
    }
  }
  validateEndpoint('nodeUrl', config.nodeUrl, ['wss:', 'ws:']);
  validateEndpoint('indexerHttpUrl', config.indexerHttpUrl, ['https:', 'http:']);
  validateEndpoint('indexerWsUrl', config.indexerWsUrl, ['wss:', 'ws:']);
  validateEndpoint('proofServerUrl', config.proofServerUrl, ['https:', 'http:']);
  return Object.freeze({
    networkId: config.networkId,
    nodeUrl: config.nodeUrl,
    indexerHttpUrl: config.indexerHttpUrl,
    indexerWsUrl: config.indexerWsUrl,
    proofServerUrl: config.proofServerUrl,
  });
}

function validateEndpoint(field, value, protocols) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`Midnight v2 provider config has malformed ${field}`);
  }
  if (!protocols.includes(url.protocol)) throw new Error(`Midnight v2 provider config has invalid ${field} protocol`);
  if (url.username || url.password || url.search || url.hash) {
    throw new Error(`Midnight v2 provider config rejects credentials or URL metadata in ${field}`);
  }
  if (
    (url.protocol === 'http:' || url.protocol === 'ws:') &&
    !isLoopback(url.hostname) &&
    !(field === 'proofServerUrl' && url.hostname === 'proof-server-experimental')
  ) {
    throw new Error(`Midnight v2 provider config requires transport security for ${field}`);
  }
}

function isLoopback(hostname) {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]';
}

function validateFactories(factories) {
  if (!factories || typeof factories !== 'object') throw new Error('Provider factories are required');
  for (const kind of PROVIDER_KINDS) {
    if (typeof factories[kind] !== 'function') throw new Error(`Provider factory ${kind} is required`);
  }
}
