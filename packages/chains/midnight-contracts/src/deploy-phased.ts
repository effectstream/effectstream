// ============================================================================
// Phased Midnight contract deployment
// ============================================================================
//
// Some contracts define so many circuits that a single deploy transaction —
// which carries every circuit's verifier key (VK) — exceeds the node's
// per-block transaction limits ("Transaction would exhaust block limits").
//
// This module deploys such contracts in phases:
//   1. Deploy the contract with NO verifier keys (a "stripped" contract state
//      that keeps only the initial data and maintenance authority).
//   2. Insert each circuit's verifier key in its own transaction, using the
//      official `submitInsertVerifierKeyTx` maintenance helper.
//
// Progress is tracked in a small resume-state file so an interrupted run can be
// continued without redeploying or re-inserting already-applied keys.
//
// This path is opt-in via `DeployConfig.phasedVerifierKeys`; the default
// single-transaction deploy in `deploy.ts` is unaffected.

import { readFileSync, writeFileSync, rmSync, readdirSync } from "node:fs";
import * as path from "node:path";
import { getNetworkId } from "@midnight-ntwrk/midnight-js-network-id";
import { ContractExecutable } from "@midnight-ntwrk/compact-js";
import {
  asContractAddress,
  exitResultOrError,
  makeContractExecutableRuntime,
  SucceedEntirely,
  type MidnightProviders,
} from "@midnight-ntwrk/midnight-js-types";
import { submitInsertVerifierKeyTx } from "@midnight-ntwrk/midnight-js-contracts";
import {
  ContractDeploy,
  ContractState,
  Intent,
  sampleSigningKey,
  Transaction,
} from "@midnightntwrk/ledger-v9";

import { CONSTANTS } from "./constants.ts";
import type { DeployConfig, WalletResult } from "./types.ts";

const log = console;

const DEFAULT_VK_INSERT_RETRIES = 3;
const DEFAULT_STATE_FILE = "deployment-state.json";

interface PhasedDeploymentState {
  contractAddress: string;
  deployedCircuits: string[];
}

function createTtl(): Date {
  return new Date(Date.now() + CONSTANTS.TTL_DURATION_MS);
}

/**
 * Enumerate circuit IDs generically from the compiled `keys/` directory.
 * Each circuit has a `<circuitId>.verifier` artifact; this avoids hardcoding a
 * per-contract circuit list.
 */
function listCircuitIds(zkConfigPath: string): string[] {
  const keysDir = path.join(zkConfigPath, "keys");
  let entries: string[];
  try {
    entries = readdirSync(keysDir);
  } catch (error) {
    throw new Error(
      `Could not read verifier keys directory '${keysDir}': ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
  const circuitIds = entries
    .filter((name) => name.endsWith(".verifier"))
    .map((name) => name.slice(0, -".verifier".length))
    .sort();
  if (circuitIds.length === 0) {
    throw new Error(`No '*.verifier' artifacts found in '${keysDir}'.`);
  }
  return circuitIds;
}

function loadState(stateFilePath: string): PhasedDeploymentState {
  try {
    const parsed = JSON.parse(
      readFileSync(stateFilePath, "utf8"),
    ) as PhasedDeploymentState;
    log.info(
      `Found existing deployment state. Resuming deployment for contract: ${parsed.contractAddress}`,
    );
    return {
      contractAddress: parsed.contractAddress ?? "",
      deployedCircuits: parsed.deployedCircuits ?? [],
    };
  } catch {
    return { contractAddress: "", deployedCircuits: [] };
  }
}

function saveState(stateFilePath: string, state: PhasedDeploymentState): void {
  writeFileSync(stateFilePath, JSON.stringify(state, null, 2));
}

/**
 * Deploy a Midnight contract in phases: empty deploy, then per-circuit verifier
 * key insertion. Returns the deployed contract address.
 */
export async function deployMidnightContractPhased(
  providers: MidnightProviders,
  // deno-lint-ignore no-explicit-any
  compiledContract: any,
  config: DeployConfig,
  // deno-lint-ignore no-explicit-any
  deployArgs: any[] | undefined,
  walletResult: WalletResult,
  zkConfigPath: string,
): Promise<string> {
  const stateFilePath = path.resolve(
    config.phasedStateFile ?? path.join(process.cwd(), DEFAULT_STATE_FILE),
  );
  const maxRetries = config.vkInsertRetries ?? DEFAULT_VK_INSERT_RETRIES;

  const state = loadState(stateFilePath);
  let contractAddress = state.contractAddress;

  log.info(
    `Phased deploy: contract=${config.contractName} resuming=${Boolean(
      contractAddress,
    )}`,
  );

  // ── Phase 1: deploy the contract with no verifier keys ────────────────────
  if (!contractAddress) {
    const signingKey = sampleSigningKey();
    const coinPublicKey = providers.walletProvider.getCoinPublicKey().toString();

    const contractExec = ContractExecutable.make(compiledContract);
    const contractRuntime = makeContractExecutableRuntime(
      providers.zkConfigProvider,
      { coinPublicKey, signingKey },
    );

    log.info("Running contract initialization to derive initial state...");
    const exitResult = await contractRuntime.runPromiseExit(
      (contractExec as any).initialize(
        config.initialPrivateState ?? undefined,
        ...(deployArgs ?? []),
      ),
    );
    const initResult = exitResultOrError(exitResult as any) as any;

    const privateState = initResult.private.privateState;
    const derivedSigningKey = initResult.private.signingKey;
    const fullContractState = initResult.public.contractState;

    // Convert the compact-runtime contract state to a ledger-v9 contract state,
    // then build a stripped copy that keeps the initial data + maintenance
    // authority but drops every circuit operation (i.e. no verifier keys).
    const fullLedgerState = ContractState.deserialize(
      fullContractState.serialize(),
    );
    const strippedState = new ContractState();
    strippedState.data = fullLedgerState.data;
    strippedState.maintenanceAuthority = fullLedgerState.maintenanceAuthority;
    log.info("Created stripped contract state (no verifier keys).");

    const contractDeploy = new ContractDeploy(strippedState);
    contractAddress = contractDeploy.address;

    const unprovenTx = Transaction.fromParts(
      getNetworkId(),
      undefined,
      undefined,
      Intent.new(createTtl()).addDeploy(contractDeploy),
    );
    log.info(`Deploying empty contract at address: ${contractAddress}`);

    const recipe = await walletResult.wallet.balanceUnprovenTransaction(
      unprovenTx as any,
      {
        shieldedSecretKeys: walletResult.walletZswapSecretKeys as any,
        dustSecretKey: walletResult.walletDustSecretKey as any,
      },
      { ttl: createTtl() },
    );
    const signedRecipe = await walletResult.wallet.signRecipe(
      recipe,
      (payload) => walletResult.unshieldedKeystore.signDataAsync(payload),
    );
    const finalizedTx = await walletResult.wallet.finalizeRecipe(signedRecipe);
    const txId = await walletResult.wallet.submitTransaction(finalizedTx);

    const txData = await providers.publicDataProvider.watchForTxData(txId);
    if (txData.status !== SucceedEntirely) {
      throw new Error(`Empty deploy failed with status ${txData.status}`);
    }
    log.info(
      `Empty deploy succeeded: address=${contractAddress} (no verifier keys).`,
    );

    // Persist the contract address, private state and signing key so the VK
    // insertion phase (and any resumed run) can find the maintenance authority.
    state.contractAddress = contractAddress;
    saveState(stateFilePath, state);

    (providers.privateStateProvider as any).setContractAddress?.(contractAddress);
    if (config.privateStateId) {
      await providers.privateStateProvider.set(
        config.privateStateId as any,
        privateState,
      );
    }
    await providers.privateStateProvider.setSigningKey(
      contractAddress,
      derivedSigningKey,
    );
  }

  // ── Phase 2: insert each circuit's verifier key individually ──────────────
  const circuitIds = listCircuitIds(zkConfigPath);
  const verifierKeys = await providers.zkConfigProvider.getVerifierKeys(
    circuitIds,
  );
  log.info(
    `Inserting ${verifierKeys.length} verifier keys one-by-one: [${circuitIds.join(
      ", ",
    )}]`,
  );

  for (const [circuitId, verifierKey] of verifierKeys) {
    if (state.deployedCircuits.includes(circuitId)) {
      log.info(`Skipping already deployed circuit: ${circuitId}`);
      continue;
    }

    log.info(`Inserting verifier key for circuit: ${circuitId}`);
    for (let attempt = 1; ; attempt++) {
      try {
        const result = await submitInsertVerifierKeyTx(
          providers,
          compiledContract,
          asContractAddress(contractAddress),
          circuitId as any,
          verifierKey,
        );
        if (result.status !== SucceedEntirely) {
          throw new Error(
            `Insert verifier key for ${circuitId} returned status ${result.status}`,
          );
        }
        break;
      } catch (error) {
        if (attempt >= maxRetries) throw error;
        log.warn(
          `Retry inserting ${circuitId} (${attempt}/${maxRetries}) due to: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
        await new Promise((r) => setTimeout(r, 2000 * attempt));
      }
    }

    state.deployedCircuits.push(circuitId);
    saveState(stateFilePath, state);
    log.info(
      `Verifier key inserted: circuit=${circuitId} (${state.deployedCircuits.length}/${verifierKeys.length})`,
    );
  }

  log.info(
    `Phased deploy complete: address=${contractAddress} circuits=[${state.deployedCircuits.join(
      ", ",
    )}]`,
  );
  try {
    rmSync(stateFilePath);
  } catch {
    // Resume-state file already gone — nothing to clean up.
  }

  return contractAddress;
}
