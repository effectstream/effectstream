import { Type } from "@sinclair/typebox";
import type { GrammarDefinition } from "@effectstream/concise";

// Ported from the paima-engine-v1 PaimaParser grammar
// (state-transition/src/stf/v1/parser.ts):
//   gainedExperience = xp|*address|experience
// with parserCommands.gainedExperience.experience = PaimaParser.NumberParser(1, 5).
// The `xp` token was just the on-chain prefix alias; in the Effectstream v2
// JSON-array encoding the full grammar key (`gainedExperience`) IS the first
// element of the submitted array, so no alias is needed.
// The `*address` field was the signer's wallet — that now arrives implicitly
// via `data.signerAddress` in the STM transition, so the only explicit field
// is `experience` (the v1 NumberParser(1, 5)).
export const grammar = {
  gainedExperience: [
    ["experience", Type.Number({ minimum: 1, maximum: 5 })],
  ],
} as const satisfies GrammarDefinition;
