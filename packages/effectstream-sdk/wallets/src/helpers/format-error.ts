/**
 * Coerce anything a wallet/SDK can throw or reject with into a readable
 * string.
 *
 * Wallet bridges return errors in three common shapes:
 *   1. `Error` instances (most JS SDKs)
 *   2. CIP-30-style `{ code: number, info: string }` (Midnight Lace, some
 *      Cardano wallets, Mina/Auro)
 *   3. Plain strings or numbers
 *
 * `String(obj)` on shape #2 yields the useless `"[object Object]"`, which
 * leaks into UIs as "Error: [object Object]". This helper unpacks all three.
 */
export function formatError(err: unknown): string {
  if (err == null) return "";
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  if (typeof err === "object") {
    const o = err as { info?: string; message?: string; code?: number };
    if (typeof o.info === "string") {
      return o.code != null ? `${o.info} (code ${o.code})` : o.info;
    }
    if (typeof o.message === "string") return o.message;
    try {
      return JSON.stringify(err);
    } catch {
      // Cyclic objects land here.
    }
  }
  return String(err);
}
