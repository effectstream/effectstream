import { realpathSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  ContractState as AliasContractState,
  StateValue as AliasStateValue,
} from "@midnight-ntwrk/onchain-runtime";
import {
  ContractState as CompactContractState,
  StateValue as CompactStateValue,
} from "@midnight-ntwrk/compact-runtime";
import { ledger } from "@evm-midnight/midnight-contract/contract";

// Compact 0.33.0-rc.2 output for the template's counter constructor, serialized
// as the indexer's raw contract-action state. Keeping this byte fixture fixed
// ensures the guard enters sync's real deserialize -> generated-ledger path.
const RAW_CONTRACT_STATE =
  "6d69646e696768743a636f6e74726163742d73746174655b76385d3a580008400804000401000c40200204080401040c080104000c402001041404010418080104000400402010101c1c202020202020202020202008021008042408041404280403042c0004300801040434200304071010400000043815020304ff0102010403040108041408010401040108400800010802104001040000010801040401040104010c40200200010801040401040104010c40200200010801040401040104010c40200100010801040401040104010c402001000104000001040000010400000104000001040000010400000104000001040000010400000104000000002824696e6372656d656e74000c000000084044000448080104044c90030440807da5723bb9e6219c7e943cd692d2c4372b6e86c3a4f1a2350445dc04fffc586e1428203c50201003000400";

function invariant(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Midnight WASM runtime identity guard: ${message}`);
}

async function loadMidnightFetcher(): Promise<any> {
  // @effectstream/sync is intentionally reached through the node's production
  // runtime dependency. This works for both a published standalone install and
  // LINK_LOCAL=1 without adding a test-only direct sync dependency.
  const nodeParent = path.resolve(import.meta.dir, "../../node/main.dev.ts");
  const runtimeEntry = Bun.resolveSync("@effectstream/runtime", nodeParent);
  const syncEntry = Bun.resolveSync("@effectstream/sync", runtimeEntry);
  const syncRoot = path.dirname(fileURLToPath(pathToFileURL(syncEntry)));
  const module = await import(
    pathToFileURL(path.join(syncRoot, "sync-protocols/midnight/fetcher.ts")).href
  );
  return module.MidnightFetcher;
}

export async function wasmRuntimeIdentityTest(): Promise<void> {
  const aliasEntry = Bun.resolveSync("@midnight-ntwrk/onchain-runtime", import.meta.path);
  const compactEntry = Bun.resolveSync("@midnight-ntwrk/compact-runtime", import.meta.path);
  const canonicalEntry = Bun.resolveSync("@midnightntwrk/onchain-runtime-v4", compactEntry);
  const aliasRealpath = realpathSync(aliasEntry);
  const canonicalRealpath = realpathSync(canonicalEntry);

  invariant(aliasRealpath === canonicalRealpath, `two physical runtime entries: ${aliasRealpath} != ${canonicalRealpath}`);
  invariant(AliasStateValue === CompactStateValue, "alias and Compact StateValue constructors differ");
  invariant(AliasContractState === CompactContractState, "alias and Compact ContractState constructors differ");

  const aliasValue = AliasStateValue.newNull();
  const compactValue = CompactStateValue.newNull();
  invariant(aliasValue instanceof CompactStateValue, "alias StateValue fails Compact instanceof");
  invariant(compactValue instanceof AliasStateValue, "Compact StateValue fails alias instanceof");

  const rawBytes = Uint8Array.from(Buffer.from(RAW_CONTRACT_STATE, "hex"));
  const aliasState = AliasContractState.deserialize(rawBytes).data.state;
  invariant(aliasState instanceof AliasStateValue, "alias deserializer returned an unexpected StateValue");
  invariant(aliasState instanceof CompactStateValue, "alias-deserialized state fails Compact instanceof");

  const directLedger = ledger(aliasState);
  invariant(directLedger.round === 0n, "generated ledger rejected or misread the direct alias-origin state");

  const MidnightFetcher = await loadMidnightFetcher();
  const fetcher = Object.create(MidnightFetcher.prototype);
  const contractAddress = "00000000000000ab";
  const operation = fetcher.fetchContractState(
    17,
    undefined,
    {
      syncProtocol: "midnight-runtime-identity",
      primitive: {
        type: "Midnight:ContractState",
        name: "counter",
        contractAddress,
        contract: { ledger },
      },
    },
    {
      block: {
        transactions: [{
          hash: "runtime-identity-fixture-tx",
          contractActions: [{ address: "ab", state: RAW_CONTRACT_STATE }],
        }],
      },
    },
  );
  const step = operation.next();
  invariant(step.done, "fetchContractState unexpectedly yielded before returning its primitive");
  const outputs = step.value as any[];
  invariant(outputs.length === 1, "fetchContractState did not emit exactly one primitive");
  invariant(outputs[0].output.payload.round === 0n, "fetch/decode/generated-ledger payload round mismatch");
  invariant(
    outputs[0].output.payload.contract_address instanceof Uint8Array,
    "fetch/decode/generated-ledger payload did not include decoded bytes",
  );

  console.log(
    `[PASS] Midnight WASM runtime identity guard (${aliasRealpath}; raw fixture ${rawBytes.length} bytes)`,
  );
}

if (import.meta.main) {
  await wasmRuntimeIdentityTest();
}
