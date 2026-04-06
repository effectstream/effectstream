import { builtinGrammars } from "@effectstream/sm/grammar";
import type { GrammarDefinition } from "@effectstream/concise";
import { Type } from "@sinclair/typebox";

export const grammar = {
  "celestia-zswap": builtinGrammars.celestiaGeneric,
  "midnight-zswap": builtinGrammars.midnightGeneric,
  "midnight-nullifier": [["payload", Type.Any()]],
  "zswap-ttl-cleanup": [["offerId", Type.Integer()]],
} as const satisfies GrammarDefinition;
