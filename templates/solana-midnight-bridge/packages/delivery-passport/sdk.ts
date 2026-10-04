// The midnight-js / ledger-v9 pieces the Passport adapter composes with (the template's SDK set:
// midnight-js 5.0.0-beta.6, compact-js 2.5.5-rc.7, ledger-v9 1.0.0-rc.3 — the set G-COMPOSE proved).
import { CompiledContract } from "@midnight-ntwrk/compact-js";
import { createUnprovenCallTx, submitTx } from "@midnight-ntwrk/midnight-js-contracts";
import { encodeContractKeyLocation, hashVerifierKey, ZKConfigRegistry } from "@midnight-ntwrk/midnight-js-types";
import { NodeZkConfigProvider } from "@midnight-ntwrk/midnight-js-node-zk-config-provider";
import { httpClientProofProvider } from "@midnight-ntwrk/midnight-js-http-client-proof-provider";
import * as ledger from "@midnightntwrk/ledger-v9";
import type { PassportAdapterConfig } from "./adapter.ts";
import { sealEntryPortable } from "./seal.ts";

export function passportSdk(): PassportAdapterConfig["sdk"] {
  return {
    CompiledContract,
    createUnprovenCallTx: createUnprovenCallTx as never,
    submitTx: submitTx as never,
    encodeContractKeyLocation,
    hashVerifierKey,
    ZKConfigRegistry: ZKConfigRegistry as never,
    NodeZkConfigProvider: NodeZkConfigProvider as never,
    httpClientProofProvider: httpClientProofProvider as never,
    ledger: ledger as never,
  };
}

export const passportSeal: PassportAdapterConfig["seal"] = (encKey, coin) => sealEntryPortable(encKey, coin);
