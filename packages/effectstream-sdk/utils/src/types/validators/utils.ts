import type { HexStringNo0x, UnknownFormat } from "../nominal.ts";

function hexStringToBytes(hexString: HexStringNo0x): number[] {
  if (!/^[0-9a-fA-F]+$/.test(hexString)) {
    throw new Error("Non-hex digits found in hex string");
  }
  const bytes: number[] = [];
  if (hexString.length % 2 !== 0) {
    hexString = "0" + hexString;
  }
  for (let c = 0; c < hexString.length; c += 2) {
    const nextByte = hexString.slice(c, c + 2);
    bytes.push(parseInt(nextByte, 16));
  }
  return bytes;
}

export function hexStringToUint8Array(hexString: UnknownFormat): Uint8Array {
  return new Uint8Array(hexStringToBytes(hexString));
}

export function uint8ArrayToHexString(uint8Array: Uint8Array): HexStringNo0x {
  // recall: slice(-2) takes two characters starting from the end of the string
  //         so this works because we <16 numbers with '0'
  return Array.prototype.map.call(
    uint8Array,
    (byte) => ("0" + byte.toString(16)).slice(-2),
  ).join("");
}

export const MALFORMED_ERROR_MSG = (str: string): string =>
  `${str} is malformed`;
export const CHECKSUM_ERROR_MSG = (str: string): string =>
  `${str} checksum is wrong`;
