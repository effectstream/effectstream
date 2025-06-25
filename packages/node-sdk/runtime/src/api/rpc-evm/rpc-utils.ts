export function isValidHexadecimal(str: string): boolean {
  // Regular expression to match a valid hexadecimal string
  const hexRegExp = /^[0-9a-fA-F]+$/;

  // Test the string against the regular expression
  return hexRegExp.test(str);
}

export function isValidBlockHash(str: string): boolean {
  // Regular expression to match a valid hexadecimal string
  const hexRegExp = /^0x[0-9a-fA-F]{64}$/;

  // Test the string against the regular expression
  return hexRegExp.test(str);
}

export function isValidTxHash(str: string): boolean {
  // block hashes & tx hashes have the same format
  return isValidBlockHash(str);
}

export function add0x(str: string): `0x${string}` {
  if (str.startsWith("0x")) {
    return str as `0x{string}`;
  }
  return `0x${str}`;
}

export function strip0x(str: string): string {
  if (str.startsWith("0x")) {
    return str.substring(2);
  }
  return str;
}

export const stringify: typeof JSON.stringify = (value, replacer, space) =>
  JSON.stringify(
    value,
    (key, value_) => {
      const value = typeof value_ === "bigint" ? value_.toString() : value_;
      return typeof replacer === "function" ? replacer(key, value) : value;
    },
    space,
  );

export type Prettify<T> =
  & {
    [K in keyof T]: T[K];
  }
  & {};
