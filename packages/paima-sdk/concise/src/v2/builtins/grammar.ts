import { Type } from "@sinclair/typebox";
import type { GrammarDefinition } from "../types.ts";
import { toKeyedJsonGrammar } from "../grammar.ts";
import { TypeboxHelpers } from "@paima/utils";

export const BatcherGrammarPrefix = {
  batcherInput: "&B",
} as const;
export const BatcherGrammar = {
  [BatcherGrammarPrefix.batcherInput]: [
    // note: we represent inputs in a batcher as string to aovid the entire batch failing if just one input is malformed
    ["input", Type.Array(Type.String())],
  ],
} as const satisfies GrammarDefinition;
export const KeyedBatcherGrammar = toKeyedJsonGrammar(BatcherGrammar);

export const BuiltinGrammarPrefix = {
  createAccount: "&createAccount",
  linkAddress: "&linkAddress",
  unlinkAddress: "&unlinkAddress",
} as const;
export const BuiltinGrammar = {
  [BuiltinGrammarPrefix.createAccount]: [],
  [BuiltinGrammarPrefix.linkAddress]: [
    ["account_id", Type.Number()],
    ["signature_from_primary", Type.String()],
    ["new_address", Type.String()],
    ["signature_from_new_address", Type.String()],
    ["is_new_primary", Type.Boolean()],
  ],
  [BuiltinGrammarPrefix.unlinkAddress]: [
    ["account_id", Type.Number()],
    // if empty, unlink self.
    ["signature_from_primary", Type.String()],
    ["account_address", Type.String()],
    ["new_primary", Type.String()],
  ],
} as const satisfies GrammarDefinition;
export const KeyedBuiltinGrammar = toKeyedJsonGrammar(BuiltinGrammar);
