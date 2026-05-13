// Shim for Node's `crypto` module in the browser. `vite-plugin-node-stdlib-browser`
// maps `crypto` → `crypto-browserify`, which lacks `timingSafeEqual` (used by
// @midnight-ntwrk/midnight-js-level-private-state-provider's storage-encryption).
// Re-export crypto-browserify and add the missing function.

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore — crypto-browserify has no bundled types
import cryptoBrowserify from 'crypto-browserify';

function timingSafeEqual(a: any, b: any): boolean {
  const av = a instanceof ArrayBuffer ? new Uint8Array(a) : new Uint8Array((a as ArrayBufferView).buffer, (a as ArrayBufferView).byteOffset, (a as ArrayBufferView).byteLength);
  const bv = b instanceof ArrayBuffer ? new Uint8Array(b) : new Uint8Array((b as ArrayBufferView).buffer, (b as ArrayBufferView).byteOffset, (b as ArrayBufferView).byteLength);
  if (av.length !== bv.length) {
    throw new RangeError('Input buffers must have the same byte length');
  }
  let r = 0;
  for (let i = 0; i < av.length; i++) r |= av[i] ^ bv[i];
  return r === 0;
}

const base: any = cryptoBrowserify;

// Mutate the shared crypto-browserify export object as well as exporting the
// function from this shim. Vite's node polyfill can resolve transitive `crypto`
// imports directly to crypto-browserify, bypassing our alias in some bundles.
base.timingSafeEqual ??= timingSafeEqual;

export { timingSafeEqual };
// Re-export everything from crypto-browserify dynamically.
export const createHash = base.createHash;
export const createHmac = base.createHmac;
export const randomBytes = base.randomBytes;
export const randomFillSync = base.randomFillSync;
export const pbkdf2 = base.pbkdf2;
export const pbkdf2Sync = base.pbkdf2Sync;
export const createCipheriv = base.createCipheriv;
export const createDecipheriv = base.createDecipheriv;
export const getCiphers = base.getCiphers;
export const getHashes = base.getHashes;

export default base;
