import { Type } from "@sinclair/typebox";

export const solanaTokenAccountGrammar = [
  ["tokenAccount", Type.String()],
  ["mint", Type.String()],
  ["owner", Type.String()],
  // SPL amounts are u64 and do not survive a JS number. Carried as the raw base
  // unit string, matching nep141Grammar's `amount` and erc20Grammar's `value`;
  // `decimals` is what turns it into a display value.
  ["amount", Type.String()],
  ["decimals", Type.Number()],
  ["slot", Type.Number()],
] as const;
