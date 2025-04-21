import { Type } from "@sinclair/typebox";
import type { GrammarDefinition } from "../types.ts";
import { toKeyedJsonGrammar } from "../grammar.ts";
import { TypeboxHelpers } from "@paima/utils";

export const BuiltinGrammarPrefix = {
  delegateWallet: "&delegate",
  migrateWallet: "&migrate",
  cancelDelegations: "&cancelDelegation",
  batcherInput: "&B",
} as const;
export const BuiltinGrammar = {
  [BuiltinGrammarPrefix.delegateWallet]: [
    ["from", TypeboxHelpers.Nullable(Type.String())],
    ["to", TypeboxHelpers.Nullable(Type.String())],
    ["from_signature", Type.String()],
    ["to_signature", Type.String()],
  ],
  [BuiltinGrammarPrefix.migrateWallet]: [
    ["from", TypeboxHelpers.Nullable(Type.String())],
    ["to", TypeboxHelpers.Nullable(Type.String())],
    ["from_signature", Type.String()],
    ["to_signature", Type.String()],
  ],
  [BuiltinGrammarPrefix.cancelDelegations]: [[
    "to",
    TypeboxHelpers.Nullable(Type.String()),
  ]],
  [BuiltinGrammarPrefix.batcherInput]: [
    // note: we represent inputs in a batcher as string to aovid the entire batch failing if just one input is malformed
    ["input", Type.Array(Type.String())],
  ],
} as const satisfies GrammarDefinition;
export const KeyedBuiltinGrammar = toKeyedJsonGrammar(BuiltinGrammar);
