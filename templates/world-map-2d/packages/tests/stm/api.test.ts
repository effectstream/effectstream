import { assert } from "../helpers.ts";
import {
  INCREMENT_X,
  INCREMENT_Y,
  MOVE_X,
  MOVE_Y,
  wallet0,
} from "./actions.test.ts";

const API_PORT = 9999;

export async function apiTest() {
  await assert(
    `GET /user_stats?wallet=… returns the wallet's current (${MOVE_X},${MOVE_Y}) position`,
    async () => {
      const res = await fetch(
        `http://localhost:${API_PORT}/user_stats?wallet=${wallet0.address.toLowerCase()}`,
      );
      if (!res.ok) return false;
      const data = (await res.json()) as
        | { wallet: string; x: number; y: number }
        | null;
      return (
        data !== null &&
        data.wallet === wallet0.address.toLowerCase() &&
        Number(data.x) === MOVE_X &&
        Number(data.y) === MOVE_Y
      );
    },
  );

  await assert(
    `GET /world_stats includes the incremented cell at (${INCREMENT_X},${INCREMENT_Y})`,
    async () => {
      const res = await fetch(`http://localhost:${API_PORT}/world_stats`);
      if (!res.ok) return false;
      const cells = (await res.json()) as Array<{
        x: number;
        y: number;
        counter: number;
      }>;
      if (!Array.isArray(cells) || cells.length < 100) return false;
      const cell = cells.find(
        (c) => Number(c.x) === INCREMENT_X && Number(c.y) === INCREMENT_Y,
      );
      return cell !== undefined && Number(cell.counter) >= 1;
    },
  );
}
