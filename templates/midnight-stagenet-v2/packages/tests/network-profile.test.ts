import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

import {
  NETWORK_PROFILE_OVERRIDE_PRECEDENCE,
  STAGENET_PROFILE_DEFAULTS,
  redactUrl,
  resolveStagenetProfile,
  validateNetworkProfile,
} from '../network-config/src/network-profile';

const lock = JSON.parse(readFileSync('/app/compatibility-lock.json', 'utf8'));
const legacySource = readFileSync('/app/legacy/midnight-env.ts');
const legacyHash = createHash('sha256').update(legacySource).digest('hex');
if (legacyHash !== lock.baselines.legacyV1MidnightEnvSha256) {
  throw new Error(`Legacy Midnight v1/local profile source drifted: ${legacyHash}`);
}

const defaults = resolveStagenetProfile({});
const expectedDefaults = {
  networkId: 'stagenet',
  nodeUrl: 'wss://rpc.stagenet.shielded.tools',
  indexerHttpUrl: 'https://indexer.stagenet.shielded.tools/api/v4/graphql',
  indexerWsUrl: 'wss://indexer.stagenet.shielded.tools/api/v4/graphql/ws',
  proofServerUrl: 'http://proof-server-experimental:6300',
  faucetUrl: 'https://faucet.stagenet.shielded.tools/api/drips',
};
if (JSON.stringify(defaults) !== JSON.stringify(expectedDefaults)) {
  throw new Error(`Stagenet defaults are not exact: ${JSON.stringify(defaults)}`);
}
if (JSON.stringify(STAGENET_PROFILE_DEFAULTS) !== JSON.stringify(expectedDefaults)) {
  throw new Error('Exported stagenet defaults differ from the resolver defaults');
}
for (const [field, expected] of Object.entries(expectedDefaults)) {
  const locked = field === 'networkId' ? lock.networkId : lock.endpoints[field];
  if (locked !== expected) throw new Error(`${field} differs between the profile and compatibility lock`);
}

const overridden = resolveStagenetProfile({
  MIDNIGHT_NETWORK_ID: 'wrong-legacy-value',
  MIDNIGHT_V2_NETWORK_ID: ' stagenet ',
  MIDNIGHT_NODE_URL: 'ws://127.0.0.1:44001',
  MIDNIGHT_V2_NODE_URL: 'ws://127.0.0.1:44002',
  MIDNIGHT_INDEXER_HTTP: 'http://127.0.0.1:44003/api/v4/graphql',
  MIDNIGHT_V2_INDEXER_HTTP_URL: 'http://127.0.0.1:44004/api/v4/graphql',
  MIDNIGHT_INDEXER_WS: 'ws://127.0.0.1:44005/api/v4/graphql/ws',
  MIDNIGHT_V2_INDEXER_WS_URL: 'ws://127.0.0.1:44006/api/v4/graphql/ws',
  MIDNIGHT_PROOF_SERVER_URL: 'http://127.0.0.1:44007',
  MIDNIGHT_V2_PROOF_SERVER_URL: 'http://127.0.0.1:44008',
  MIDNIGHT_FAUCET_URL: 'http://127.0.0.1:44009/api/drips',
  MIDNIGHT_V2_FAUCET_URL: 'http://127.0.0.1:44010/api/drips',
});
if (
  overridden.nodeUrl !== 'ws://127.0.0.1:44002' ||
  overridden.indexerHttpUrl !== 'http://127.0.0.1:44004/api/v4/graphql' ||
  overridden.indexerWsUrl !== 'ws://127.0.0.1:44006/api/v4/graphql/ws' ||
  overridden.proofServerUrl !== 'http://127.0.0.1:44008' ||
  overridden.faucetUrl !== 'http://127.0.0.1:44010/api/drips'
) {
  throw new Error(`MIDNIGHT_V2_* overrides did not win: ${JSON.stringify(overridden)}`);
}
if (NETWORK_PROFILE_OVERRIDE_PRECEDENCE.proofServerUrl[0] !== 'MIDNIGHT_V2_PROOF_SERVER_URL') {
  throw new Error('Override precedence is not explicit and v2-first');
}
const legacyAliasOnly = resolveStagenetProfile({
  MIDNIGHT_NODE_URL: 'ws://127.0.0.1:44101',
  MIDNIGHT_INDEXER_HTTP: 'http://127.0.0.1:44102/api/v4/graphql',
  MIDNIGHT_INDEXER_WS: 'ws://127.0.0.1:44103/api/v4/graphql/ws',
  MIDNIGHT_PROOF_SERVER: 'http://127.0.0.1:44104',
  MIDNIGHT_FAUCET_URL: 'http://127.0.0.1:44105/api/drips',
});
if (
  legacyAliasOnly.nodeUrl !== 'ws://127.0.0.1:44101' ||
  legacyAliasOnly.proofServerUrl !== 'http://127.0.0.1:44104'
) {
  throw new Error(`Legacy endpoint aliases did not form the second precedence tier: ${JSON.stringify(legacyAliasOnly)}`);
}

let providerConstructed = false;
expectFailure('missing proof server', 'proofServerUrl is required', () => {
  validateNetworkProfile({ ...defaults, proofServerUrl: undefined });
  providerConstructed = true;
});
if (providerConstructed) throw new Error('Provider construction proceeded without a proof server');

expectFailure('malformed node URL', 'nodeUrl is malformed: <invalid-url>', () =>
  validateNetworkProfile({ ...defaults, nodeUrl: 'not a url?token=secret' }),
);
expectFailure('insecure remote node', 'must use transport security outside loopback', () =>
  validateNetworkProfile({ ...defaults, nodeUrl: 'ws://rpc.example.test' }),
);
expectFailure('wrong node protocol', 'uses an unsupported protocol', () =>
  validateNetworkProfile({ ...defaults, nodeUrl: 'https://rpc.example.test' }),
);
expectFailure('insecure remote indexer', 'must use transport security outside loopback', () =>
  validateNetworkProfile({ ...defaults, indexerHttpUrl: 'http://indexer.example.test/graphql' }),
);

const credentialUrl = 'https://alice:secret@example.test/path?token=hunter2#private';
const credentialError = captureFailure(() => validateNetworkProfile({ ...defaults, faucetUrl: credentialUrl }));
if (
  !credentialError.includes('must not contain credentials: https://example.test/path') ||
  ['alice', 'secret', 'token', 'hunter2', 'private'].some((secret) => credentialError.includes(secret))
) {
  throw new Error(`Credential-bearing URL was not safely redacted: ${credentialError}`);
}
if (redactUrl(credentialUrl) !== 'https://example.test/path') throw new Error('redactUrl retained URL secrets');

console.log(
  JSON.stringify({
    checkpoint: 'C07',
    networkId: defaults.networkId,
    hostedEndpoints: 4,
    localProofServer: defaults.proofServerUrl,
    overridePolicy: 'MIDNIGHT_V2_* > legacy alias > literal default',
    legacyV1Sha256: legacyHash,
    status: 'pass',
  }),
);

function expectFailure(label: string, expected: string, operation: () => void): void {
  const error = captureFailure(operation);
  if (!error.includes(expected)) throw new Error(`${label} failed with unrelated diagnostic: ${error}`);
}

function captureFailure(operation: () => void): string {
  try {
    operation();
  } catch (error) {
    return String(error);
  }
  throw new Error('Expected operation to fail');
}
