import sha3 from "js-sha3";
const { keccak_256 } = sha3;
import type { HexString0x } from "@effectstream/utils";

export function generatePrecompile<T extends string>(name: T): HexString0x {
  // trim to 20 bytes to have evm-sized addresses
  const hash = keccak_256(name).slice(0, 40);

  return `0x${hash}`;
}

type EnumToPrecompile<T extends Record<string, string>> = {
  [K in keyof T as T[K]]: HexString0x;
};

export function generatePrecompiles<T extends Record<string, string>>(
  names: T,
): EnumToPrecompile<T> {
  if (names == null) return {} as EnumToPrecompile<T>; // this happens if you have an empty enum like `enum PrecompileNames {}`

  const result: Record<string, string> = {};
  for (const val of Object.values(names)) {
    result[val] = generatePrecompile(val);
  }
  return result as EnumToPrecompile<T>;
}
