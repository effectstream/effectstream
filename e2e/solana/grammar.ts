import type { GrammarDefinition } from "@effectstream/concise";
import { builtinGrammars } from "@effectstream/sm/grammar";

export const grammar = {
  "solana-program-log": builtinGrammars.solanaProgramLog,
  "solana-account-balance": builtinGrammars.solanaAccountBalance,
  "solana-token-account": builtinGrammars.solanaTokenAccount,
} as const satisfies GrammarDefinition;
