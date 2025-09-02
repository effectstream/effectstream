import { Type } from "@sinclair/typebox";
import type { GrammarDefinition } from "../types.ts";
import { toKeyedJsonGrammar } from "../grammar.ts";

export const BatcherGrammarPrefix = {
  batcherInput: "&B",
} as const;
export const BatcherGrammar = {
  [BatcherGrammarPrefix.batcherInput]: [
    // NOTE: we represent inputs in a batcher as string to avoid the entire batch failing if just one input is malformed
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
    ["primary_address_type", Type.Number()],
    ["new_address", Type.String()],
    ["signature_from_new_address", Type.String()],
    ["new_address_type", Type.Number()],
    ["is_new_primary", Type.Boolean()],
  ],
  [BuiltinGrammarPrefix.unlinkAddress]: [
    ["account_id", Type.Number()],
    // if empty, unlink self.
    ["signature_from_primary", Type.String()],
    ["primary_address_type", Type.Number()],
    ["target_address", Type.String()],
    ["target_address_type", Type.Number()],
    ["new_primary_address", Type.String()],
    ["new_primary_address_type", Type.Number()],
  ],
} as const satisfies GrammarDefinition;
export const KeyedBuiltinGrammar = toKeyedJsonGrammar(BuiltinGrammar);
