import { Type } from "@sinclair/typebox";

// Flat named fields (not a single `payload` blob) so the owned-table trigger
// on effectstream.primitive_accounting can read each column directly via
// `payload->>'field'` — mirrors the ERC20/NEP141 grammars. All strings;
// `amount` is a decimal string (u64 mints exceed MAX_SAFE_INTEGER) cast to
// numeric in SQL; `entryPoint` is informational (defaulted to "").
export const midnightTokenMintGrammar = [
  ["contractAddress", Type.String()],
  ["domainSep", Type.String()],
  ["rawTokenType", Type.String()],
  ["kind", Type.String()],
  ["amount", Type.String()],
  ["txHash", Type.String()],
  ["entryPoint", Type.String()],
] as const;
