import { Type } from "@sinclair/typebox";
import { builtinGrammars } from "@effectstream/sm/grammar";
import type { GrammarDefinition } from "@effectstream/concise";

export const grammar = {
  // Primitives
  "celestia-zswap": builtinGrammars.celestiaGeneric,
  "midnight-zswap": builtinGrammars.midnightGeneric,
  "midnight-nullifier": [["payload", Type.Any()]],
  "midnight-unshielded-spend": [["payload", Type.Any()]],

  // Scheduled game input used for TTL cleanup.
  "zswap-ttl-cleanup": [["offerId", Type.Integer()]],
} as const satisfies GrammarDefinition;
