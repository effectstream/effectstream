import {
  extractIndexerCapability,
  fingerprintIndexerCapability,
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

if (
  lock.networkId !== 'stagenet' ||
  lock.hostedZkirV3Verification !== 'unverified' ||
  lock.toolchain.midnightJs !== '5.0.0-beta.6' ||
  lock.toolchain.compactCompiler !== '0.33.0-rc.1' ||
  lock.toolchain.walletPackages['@midnightntwrk/wallet-sdk-prover-client'] !== '2.0.0-beta.2' ||
  lock.endpoints.nodeUrl !== 'wss://rpc.stagenet.shielded.tools'
) {
  throw new Error('Compatibility lock does not contain the selected beta.6/rc.1 lane');
}

console.log(JSON.stringify({ checkpoint: 'C02-fixtures', fingerprint, status: 'pass' }));

function throws(operation: () => void): boolean {
  try {
    operation();
    return false;
  } catch {
    return true;
  }
}
