import { readFile } from 'node:fs/promises';

import {
  createUnprovenCallTxFromInitialStates,
  createUnprovenDeployTxFromVerifierKeys,
} from '@midnight-ntwrk/midnight-js-contracts';
import { httpClientProofProvider } from '@midnight-ntwrk/midnight-js-http-client-proof-provider';
import { getNetworkId, setNetworkId } from '@midnight-ntwrk/midnight-js-network-id';
import { CompiledContract } from '@midnight-ntwrk/midnight-js-protocol/compact-js';
import { sampleSigningKey } from '@midnight-ntwrk/midnight-js-protocol/compact-runtime';
import {
  ContractCall,
  LedgerParameters,
  LedgerState,
  sampleCoinPublicKey,
  sampleEncryptionPublicKey,
  TransactionContext,
  WellFormedStrictness,
  ZswapChainState,
} from '@midnight-ntwrk/midnight-js-protocol/ledger';
import {
  createProverKey,
  createVerifierKey,
  createZKIR,
  ZKConfigProvider,
} from '@midnight-ntwrk/midnight-js-types';

import * as KeccakContract from '../../generated/keccak-smoke/contract/index.js';

const circuitId = 'hashAndStore';
const artifactDir = '/app/generated/keccak-smoke';
const experimentalUrl = requiredEnv('EXPERIMENTAL_PROOF_SERVER_URL');
const plainUrl = requiredEnv('PLAIN_PROOF_SERVER_URL');

async function main() {
  setNetworkId('undeployed');

  const localStack = await waitForLocalStack();
  const zkConfigProvider = new FileZKConfigProvider();
  const compiledContract = CompiledContract.make('KeccakToolchainSmoke', KeccakContract.Contract).pipe(
    CompiledContract.withVacantWitnesses,
  );
  const coinPublicKey = sampleCoinPublicKey();
  const encryptionPublicKey = sampleEncryptionPublicKey();

  const deploy = await createUnprovenDeployTxFromVerifierKeys(
    zkConfigProvider,
    coinPublicKey,
    { compiledContract, signingKey: sampleSigningKey() },
    encryptionPublicKey,
  );
  const call = await createUnprovenCallTxFromInitialStates(
    zkConfigProvider,
    {
      compiledContract,
      circuitId,
      contractAddress: deploy.public.contractAddress,
      coinPublicKey,
      initialContractState: deploy.public.initialContractState,
      initialZswapChainState: new ZswapChainState(),
      initialPrivateState: deploy.private.initialPrivateState,
      ledgerParameters: LedgerParameters.initialParameters(),
      args: [Uint8Array.from({ length: 32 }, (_, index) => index)],
    },
    encryptionPublicKey,
  );
  const unprovenTx = call.private.unprovenTx;

  const experimentalProvider = httpClientProofProvider(experimentalUrl, zkConfigProvider);
  const experimentalStartedAt = performance.now();
  const provenDeployTx = await experimentalProvider.proveTx(deploy.private.unprovenTx, { timeout: 600_000 });
  const provenTx = await experimentalProvider.proveTx(unprovenTx, { timeout: 600_000 });
  const experimentalDurationMs = Math.round(performance.now() - experimentalStartedAt);
  const actions = [...(provenTx.intents?.values() ?? [])].flatMap((intent) => intent.actions);
  const contractCall = actions.find((action) => action instanceof ContractCall);
  if (!contractCall || contractCall.entryPoint !== circuitId) {
    throw new Error('Experimental proof server did not return the expected proven contract call');
  }

  const strictness = new WellFormedStrictness();
  strictness.verifyContractProofs = true;
  strictness.verifyNativeProofs = false;
  strictness.enforceBalancing = false;
  const verificationTime = new Date();
  const emptyLedger = new LedgerState(getNetworkId(), new ZswapChainState());
  const verifiedDeployTx = provenDeployTx.wellFormed(emptyLedger, strictness, verificationTime);
  const secondsSinceEpoch = BigInt(Math.floor(verificationTime.getTime() / 1_000));
  const transactionContext = new TransactionContext(emptyLedger, {
    secondsSinceEpoch,
    secondsSinceEpochErr: 60,
    parentBlockHash: '00'.repeat(32),
    lastBlockTime: secondsSinceEpoch - 6n,
  });
  const [deployedLedger, deployResult] = emptyLedger.apply(verifiedDeployTx, transactionContext);
  if (deployResult.type !== 'success') {
    throw new Error(`Local deploy application failed: ${deployResult.error ?? deployResult.type}`);
  }
  provenTx.wellFormed(deployedLedger, strictness, verificationTime);

  let plainRejected = false;
  let plainFailure = '';
  const plainStartedAt = performance.now();
  try {
    await httpClientProofProvider(plainUrl, zkConfigProvider).proveTx(unprovenTx, { timeout: 120_000 });
  } catch (error) {
    plainRejected = true;
    plainFailure = errorText(error).slice(0, 240);
  }
  if (!plainRejected) {
    throw new Error('Plain proof server unexpectedly accepted a ZKIR-v3 transaction');
  }
  const plainRejectionDurationMs = Math.round(performance.now() - plainStartedAt);

  console.log(
    JSON.stringify({
      checkpoint: 'C03-local-toolchain',
      runtime: process.release.name,
      platform: {
        client: `${process.platform}/${process.arch}`,
        nodeImage: 'linux/arm64',
        indexerImage: 'linux/amd64 (Docker emulation)',
        proofImages: 'linux/arm64',
      },
      node: localStack.node,
      indexer: localStack.indexer,
      experimentalProofVersion: localStack.experimentalProofVersion,
      plainProofVersion: localStack.plainProofVersion,
      circuitId,
      cryptographicVerification: 'ledger-v9 wellFormed verifyContractProofs=true',
      timingMs: { experimentalDeployAndCall: experimentalDurationMs, plainRejection: plainRejectionDurationMs },
      plainServerRejectedV3: true,
      plainFailure,
      status: 'pass',
    }),
  );
}

class FileZKConfigProvider extends ZKConfigProvider {
  async getZKIR(requestedCircuitId) {
    assertCircuit(requestedCircuitId);
    return createZKIR(await readFile(`${artifactDir}/zkir/${circuitId}.bzkir`));
  }

  async getProverKey(requestedCircuitId) {
    assertCircuit(requestedCircuitId);
    return createProverKey(await readFile(`${artifactDir}/keys/${circuitId}.prover`));
  }

  async getVerifierKey(requestedCircuitId) {
    assertCircuit(requestedCircuitId);
    return createVerifierKey(await readFile(`${artifactDir}/keys/${circuitId}.verifier`));
  }
}

function assertCircuit(requestedCircuitId) {
  if (requestedCircuitId !== circuitId) {
    throw new Error(`Unexpected circuit id: ${String(requestedCircuitId)}`);
  }
}

async function waitForLocalStack() {
  const deadline = Date.now() + 180_000;
  let latestError = 'not started';
  while (Date.now() < deadline) {
    try {
      const [node, indexer, experimentalProofVersion, plainProofVersion] = await Promise.all([
        nodeIdentity(),
        indexerIdentity(),
        fetchText(`${experimentalUrl}/version`),
        fetchText(`${plainUrl}/version`),
      ]);
      return { node, indexer, experimentalProofVersion, plainProofVersion };
    } catch (error) {
      latestError = errorText(error);
      await new Promise((resolve) => setTimeout(resolve, 2_000));
    }
  }
  throw new Error(`Local stack did not become ready: ${latestError}`);
}

async function nodeIdentity() {
  const chain = await nodeRpc('system_chain');
  const runtime = await nodeRpc('state_getRuntimeVersion');
  const header = await nodeRpc('chain_getHeader');
  const block = Number.parseInt(header.number, 16);
  if (chain !== 'Midnight Undeployed' || runtime.specVersion !== 2_000_000 || block < 1) {
    throw new Error(`Unexpected local node identity: ${chain}/${runtime.specVersion}/block-${block}`);
  }
  return { chain, specVersion: runtime.specVersion, block };
}

async function nodeRpc(method) {
  const response = await fetch('http://midnight-node:9944', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: method, method, params: [] }),
  });
  const payload = await response.json();
  if (!response.ok || payload.error) throw new Error(`Node RPC ${method} failed`);
  return payload.result;
}

async function indexerIdentity() {
  const response = await fetch('http://indexer:8088/api/v4/graphql', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ query: 'query C03IndexerSmoke { __typename }' }),
  });
  const payload = await response.json();
  if (!response.ok || payload.errors || payload.data?.__typename !== 'Query') {
    throw new Error('Indexer GraphQL v4 smoke failed');
  }
  return { api: 'v4', typename: payload.data.__typename };
}

async function fetchText(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url} returned HTTP ${response.status}`);
  return (await response.text()).trim();
}

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

function errorText(error) {
  return error instanceof Error ? `${error.name}: ${error.message}` : String(error);
}

await main();
