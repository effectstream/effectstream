import { assert } from "../helpers.ts";
import { EXPECTED_MIN_XP, wallet0 } from "./actions.test.ts";

const API_PORT = 9999;

export async function apiTest() {
  await assert(
    `GET /user_state?wallet=… returns the signer's accumulated experience (>= ${EXPECTED_MIN_XP})`,
    async () => {
      const res = await fetch(
        `http://localhost:${API_PORT}/user_state?wallet=${wallet0.address.toLowerCase()}`,
      );
      if (!res.ok) return false;
      const data = (await res.json()) as {
        wallet: string;
        experience: number;
      } | null;
      return (
        data !== null &&
        data.wallet === wallet0.address.toLowerCase() &&
        Number(data.experience) >= EXPECTED_MIN_XP
      );
    },
  );

  await assert(
    "GET /user_state for an unknown wallet returns a zeroed record",
    async () => {
      const unknown = "0x000000000000000000000000000000000000dead";
      const res = await fetch(
        `http://localhost:${API_PORT}/user_state?wallet=${unknown}`,
      );
      if (!res.ok) return false;
      const data = (await res.json()) as {
        wallet: string;
        experience: number;
      };
      return data.wallet === unknown && Number(data.experience) === 0;
    },
  );
}
