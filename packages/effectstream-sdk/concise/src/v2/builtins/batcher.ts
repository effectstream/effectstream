import { Type } from "@sinclair/typebox";
import type { GrammarDefinition } from "../types.ts";
import { toKeyedJsonGrammar } from "../grammar.ts";
import { AddressType, AddressValidator } from "@effectstream/utils";

/**
 * builtins are prefixed with '&' to avoid conflicts with user-defined grammars
 */
export const INTERNAL_COMMAND_PREFIX = "&";

function userAddress<Addr extends AddressType>(
  addr: Addr,
): ["userAddress", (typeof AddressValidator)[Addr]] {
  return ["userAddress", AddressValidator[addr]];
}
const BatcherInnerCommon = [
  ["userSignature", Type.String()],
  ["conciseInput", Type.String()],
  ["millisecondTimestamp", Type.String()],
] as const;
export const BatcherInnerGrammar = {
  [`${AddressType.NONE}`]: [
    userAddress(AddressType.NONE),
    ...BatcherInnerCommon,
  ],
  [`${AddressType.EVM}`]: [userAddress(AddressType.EVM), ...BatcherInnerCommon],
  [`${AddressType.CARDANO}`]: [
    userAddress(AddressType.CARDANO),
    ...BatcherInnerCommon,
  ],
  [`${AddressType.SUBSTRATE}`]: [
    userAddress(AddressType.SUBSTRATE),
    ...BatcherInnerCommon,
  ],
  [`${AddressType.AVAIL}`]: [
    userAddress(AddressType.AVAIL),
    ...BatcherInnerCommon,
  ],
  [`${AddressType.ALGORAND}`]: [
    userAddress(AddressType.ALGORAND),
    ...BatcherInnerCommon,
  ],
  [`${AddressType.MINA}`]: [
    userAddress(AddressType.MINA),
    ...BatcherInnerCommon,
  ],
  [`${AddressType.MIDNIGHT}`]: [
    userAddress(AddressType.MIDNIGHT),
    ...BatcherInnerCommon,
  ],
  [`${AddressType.POLKADOT}`]: [
    userAddress(AddressType.POLKADOT),
    ...BatcherInnerCommon,
  ],
} as const satisfies GrammarDefinition satisfies Record<AddressType, any>;
export const KeyedBuiltinBatcherInnerGrammar = toKeyedJsonGrammar(
  BatcherInnerGrammar,
);
