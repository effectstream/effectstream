/** Convert raw indexer hex without JavaScript's truncation/NaN coercions. */
export function strictHexToBytes(rawHex: string): Uint8Array {
  const clean = rawHex.startsWith("0x") ? rawHex.slice(2) : rawHex;
  if (clean.length % 2 !== 0) {
    throw new Error(`raw hex must have an even length (received ${clean.length})`);
  }
  if (!/^[0-9a-fA-F]*$/.test(clean)) {
    throw new Error("raw hex contains a non-hexadecimal byte");
  }

  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = Number.parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}
