/**
 * Table API tests - /table-schema and /tables endpoints.
 */
import { assert } from "@e2e/engine";
import { ENV } from "@effectstream/utils/node-env";

export async function tableApiTest(apiPort: number) {
  await assert("API: /table-schema returns column definitions", async () => {
    const res = await fetch(`http://localhost:${apiPort}/table-schema/game_results`, {
      headers: { "x-api-key": ENV.API_KEY_OPEN_ENDPOINTS_EXPLORER },
    });
    if (!res.ok) return false;
    const data = await res.json();
    const columns = data.map((r: any) => r.column_name);
    return columns.includes("id") && columns.includes("a") && columns.includes("b") && columns.includes("result");
  });

  await assert("API: /tables returns data with pagination", async () => {
    const res = await fetch(`http://localhost:${apiPort}/tables/game_results?limit=10`, {
      headers: { "x-api-key": ENV.API_KEY_OPEN_ENDPOINTS_EXPLORER },
    });
    if (!res.ok) return false;
    const { data, pagination } = await res.json();
    return Array.isArray(data) && pagination !== undefined;
  });
}
