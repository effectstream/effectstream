import type { Client } from "pg";
import { assert } from "../helpers.ts";

const API = "http://localhost:9999";

export async function eligibilityApiTest(db: Client) {
  // Get a known credential from the DB
  const res = await db.query("SELECT staking_credential FROM eligible_voters LIMIT 1");
  const knownCred = res.rows[0]?.staking_credential;

  if (knownCred) {
    await assert("GET /api/eligible/<known> returns 200", async () => {
      const r = await fetch(`${API}/api/eligible/${encodeURIComponent(knownCred)}`);
      if (!r.ok) return false;
      const data = await r.json();
      return data.staking_credential === knownCred;
    });
  }

  await assert("GET /api/eligible/nonexistent returns 404", async () => {
    const r = await fetch(`${API}/api/eligible/nonexistent_credential_0000`);
    return r.status === 404;
  });
}
