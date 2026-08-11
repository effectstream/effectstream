import {
  extractIndexerCapability,
  fingerprintIndexerCapability,
  findCompatibilityDrift,
  NETWORK,
  redactEndpoints,
  redactUrl,
  validateIndexerCapability,
  validateNodeObservation,
  type NodeObservation,
} from './compatibility';

const root = '/app';
const node = (await Bun.file(`${root}/packages/tests/fixtures/node-compatible.json`).json()) as NodeObservation;
const indexerPayload = await Bun.file(`${root}/packages/tests/fixtures/indexer-contract-events.json`).json();
const lock = await Bun.file(`${root}/compatibility-lock.json`).json();

validateNodeObservation(node);
const capability = extractIndexerCapability(indexerPayload);
validateIndexerCapability(capability);
const fingerprint = fingerprintIndexerCapability(capability);

if (lock.hostedObservation.contractEventSchemaFingerprint !== fingerprint) {
  throw new Error(
    `Fixture fingerprint mismatch: lock=${lock.hostedObservation.contractEventSchemaFingerprint} fixture=${fingerprint}`,
  );
}

const driftedNode = { ...node, specVersion: node.specVersion + 1 };
if (!throws(() => validateNodeObservation(driftedNode))) {
  throw new Error('A changed spec version was not rejected');
}

const compatibleObservation = {
  networkId: NETWORK.networkId,
  endpoints: NETWORK,
  node,
  contractEventSchemaFingerprint: fingerprint,
};
if (findCompatibilityDrift(lock, compatibleObservation).length !== 0) {
  throw new Error('Compatible live observation was reported as drift');
}
const drift = findCompatibilityDrift(lock, {
  ...compatibleObservation,
  node: driftedNode,
  contractEventSchemaFingerprint: '00'.repeat(32),
});
if (
  drift.length !== 2 ||
  !drift.some((entry) => entry.startsWith('node.specVersion:')) ||
  !drift.some((entry) => entry.startsWith('indexer.contractEventSchemaFingerprint:'))
) {
  throw new Error(`Compatibility drift report is incomplete: ${JSON.stringify(drift)}`);
}

const driftedCapability = {
  ...capability,
  contractEventTypes: capability.contractEventTypes.filter((name) => name !== 'UnpausedEvent'),
};
if (!throws(() => validateIndexerCapability(driftedCapability))) {
  throw new Error('A missing required event type was not rejected');
}

const redacted = redactUrl('https://user:secret@example.test/path?token=secret#fragment');
if (redacted !== 'https://example.test/path') {
  throw new Error(`URL redaction failed: ${redacted}`);
}
const redactedReport = JSON.stringify(redactEndpoints({
  node: 'wss://user:secret@example.test/rpc?token=hunter2#private',
}));
if (
  redactedReport !== '{"node":"wss://example.test/rpc"}' ||
  ['user', 'secret', 'token', 'hunter2', 'private'].some((value) => redactedReport.includes(value))
) {
  throw new Error(`Machine report redaction failed: ${redactedReport}`);
}

if (
  lock.status !== 'release-locked-hosted-integrated-validated' ||
  lock.networkId !== 'stagenet' ||
  lock.hostedZkirV3Verification !== 'validated' ||
  lock.hostedIntegratedTemplateVerification !== 'validated' ||
  lock.hostedIntegratedObservation.transaction.hash !==
    'ff60ee5657415fc331c6d0532ba412301e2850b80d28d71d26af3727a51f6aad' ||
  lock.hostedIntegratedObservation.keccak256Digest !==
    '290decd9548b62a8d60345a988386fc84ba6bc95484008f6362f93160ef3e563' ||
  lock.hostedIntegratedObservation.effectstreamProcessedCount !== 1 ||
  lock.hostedIntegratedObservation.effectstreamReplayApplied !== false ||
  lock.toolchain.midnightJs !== '5.0.0-beta.6' ||
  lock.toolchain.compactCompiler !== '0.33.0-rc.1' ||
  lock.toolchain.walletPackages['@midnightntwrk/wallet-sdk-prover-client'] !== '2.0.0-beta.2' ||
  lock.endpoints.nodeUrl !== 'wss://rpc.stagenet.shielded.tools'
) {
  throw new Error('Compatibility lock does not contain the selected beta.6/rc.1 lane');
}

console.log(JSON.stringify({
  checkpoint: 'C17-fixtures',
  fingerprint,
  driftPaths: drift.map((entry) => entry.split(':', 1)[0]),
  redactedReport: true,
  status: 'pass',
}));

function throws(operation: () => void): boolean {
  try {
    operation();
    return false;
  } catch {
    return true;
  }
}
