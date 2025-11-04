// list of built-in grammars
// this list is exposed to the effectstream-sdk modules via the @effectstream/sm/grammar module

import { midnightGenericGrammar } from "./midnight-generic/midnight-genetic-grammar.ts";
import { erc721Grammar } from "./evm-erc721/erc721-grammar.ts";
import { erc20Grammar } from "./evm-erc20/erc20-grammar.ts";
import { availGenericGrammar } from "./avail-generic/avail-generic-grammar.ts";
import { erc1155Grammar } from "./evm-erc1155/erc1155-grammar.ts";

export const builtinGrammars = {
  midnightGeneric: midnightGenericGrammar,
  evmErc721: erc721Grammar,
  evmErc20: erc20Grammar,
  availGeneric: availGenericGrammar,
  evmErc1155: erc1155Grammar,
} as const;