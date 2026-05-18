import { assert } from "../helpers.ts";

const API_PORT = parseInt(process.env["EFFECTSTREAM_API_PORT"] || "9999", 10);

export async function apiErc721DetailTest() {
  await assert("GET /api/erc721 returns minted token with correct shape", async () => {
    const res = await fetch(`http://localhost:${API_PORT}/api/erc721`);
    const data = await res.json() as any[];
    if (!Array.isArray(data) || data.length === 0) return false;
    const first = data[0];
    return (
      typeof first.token_id === "string" &&
      "owner" in first &&
      typeof first.block_height === "number" &&
      "property_name" in first &&
      "value" in first
    );
  });

  await assert("GET /api/erc721 contains token 42 from erc721Test", async () => {
    const res = await fetch(`http://localhost:${API_PORT}/api/erc721`);
    const data = await res.json() as any[];
    return data.some((row: any) => row.token_id === "42");
  });
}
