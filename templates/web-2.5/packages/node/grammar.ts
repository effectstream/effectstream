import { Type } from "@sinclair/typebox";
import type { GrammarDefinition } from "@effectstream/concise";

// Ported from the paima-engine-v1 PaimaParser grammar:
//   changedName     = r|*address|name        (NCharsParser 1..50)
//   gainedExperience = xp|*address|experience (NumberParser  1..999)
//
// In the v2 Typebox grammar the *address field is dropped: the wallet that
// signs the input is already available as `data.signerAddress` inside the
// transition, so we don't carry a redundant address in the payload.
export const grammar = {
  changedName: [
    ["name", Type.String({ minLength: 1, maxLength: 50 })],
  ],
  gainedExperience: [
    ["experience", Type.Number({ minimum: 1, maximum: 999 })],
  ],
} as const satisfies GrammarDefinition;
