/**
 * NEAR:AccountWatch primitive test.
 *
 * Verifies that a FunctionCall made to the watched contract is captured by the
 * NEAR:AccountWatch primitive even when no NEP-297 event is emitted — that is,
 * the fetcher's outcome-capture branch reaches `effectstream.primitive_accounting`
 * with the expected shape.
 *
 * The test relies on `deploy-and-call.ts` calling `emit_event(message=MESSAGE)`
 * on `test.near` during sandbox init. The fetcher emits a row whose `args`
 * field contains the unique MESSAGE literal (because args is the base64-decoded
 * JSON of the FunctionCall arguments).
 *
 * Scope note: this test asserts against `primitive_accounting` only, matching
 * the existing pattern for NEAR:Generic and NEAR:Intent. User-side STM handler
 * invocation for NEAR primitives is an existing concern not addressed here.
 */
import { assertSQL } from "@e2e-v2/engine";
import { readFileSync } from "fs";
import path from "path";
import type { Client } from "pg";

export async function runAccountWatchTest(db: Client): Promise<void> {
  const messagePath = path.resolve(
    import.meta.dirname!,
    "../../shared/contracts/near/build/test-message.txt",
  );
  const expectedMessage = readFileSync(messagePath, "utf-8").trim();

  await assertSQL<{ primitive_name: string; payload: any }>(
    `NEAR:AccountWatch — primitive_accounting has an emit_event FunctionCall with args containing "${expectedMessage}"`,
    db,
    `SELECT primitive_name, payload FROM effectstream.primitive_accounting WHERE primitive_name = 'NearAccountWatch' LIMIT 20;`,
    (res) => res.rows.length >= 1,
    (res) => {
      const row = res.rows.find((r: any) => {
        const outer = typeof r.payload === "string" ? JSON.parse(r.payload) : r.payload;
        const p = outer?.payload ?? outer;
        return (
          p?.method_name === "emit_event" &&
          typeof p?.args === "string" &&
          p.args.includes(expectedMessage)
        );
      });
      return row != null;
    },
  );

  await assertSQL<{ primitive_name: string; payload: any }>(
    `NEAR:AccountWatch — primitive_accounting row has expected fields (signer_id, receiver_id, status)`,
    db,
    `SELECT primitive_name, payload FROM effectstream.primitive_accounting WHERE primitive_name = 'NearAccountWatch' LIMIT 20;`,
    (res) => res.rows.length >= 1,
    (res) => {
      const row = res.rows.find((r: any) => {
        const outer = typeof r.payload === "string" ? JSON.parse(r.payload) : r.payload;
        const p = outer?.payload ?? outer;
        return (
          p?.signer_id === "test.near" &&
          p?.receiver_id === "test.near" &&
          p?.status === "success" &&
          typeof p?.method_name === "string" &&
          typeof p?.deposit === "string"
        );
      });
      return row != null;
    },
  );
}
