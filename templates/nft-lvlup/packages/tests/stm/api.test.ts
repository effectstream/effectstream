import { assert } from "../helpers.ts";
import { FIRE_TOKEN, WATER_TOKEN, wallet0, wallet1 } from "./actions.test.ts";

const API_PORT = 9999;

// After nftMintTest + lvlUpTest the fire character (token 1, owned by wallet0)
// is at level 3 and the water character (token 2, owned by wallet1) at level 1.
export async function apiTest() {
  await assert(
    `GET /characters?wallet= returns the owner's characters with levels`,
    async () => {
      const res = await fetch(
        `http://localhost:${API_PORT}/characters?wallet=${wallet0.address.toLowerCase()}`,
      );
      if (!res.ok) return false;
      const data = (await res.json()) as any;
      if (!data || !Array.isArray(data.characters)) return false;
      const fire = data.characters.find(
        (c: any) => String(c.nft_id) === String(FIRE_TOKEN),
      );
      return fire != null && fire.type === "fire" && Number(fire.level) === 3;
    },
  );

  await assert(
    `GET /owned_characters?wallet= (v1-compat alias) works too`,
    async () => {
      const res = await fetch(
        `http://localhost:${API_PORT}/owned_characters?wallet=${wallet1.address.toLowerCase()}`,
      );
      if (!res.ok) return false;
      const data = (await res.json()) as any;
      if (!data || !Array.isArray(data.characters)) return false;
      const water = data.characters.find(
        (c: any) => String(c.nft_id) === String(WATER_TOKEN),
      );
      return water != null && water.type === "water" && Number(water.level) === 1;
    },
  );

  await assert(
    `GET /character/:nftId returns the character level by token id`,
    async () => {
      const res = await fetch(
        `http://localhost:${API_PORT}/character/${FIRE_TOKEN}`,
      );
      if (!res.ok) return false;
      const character = (await res.json()) as any;
      return (
        character != null &&
        String(character.nft_id) === String(FIRE_TOKEN) &&
        character.type === "fire" &&
        Number(character.level) === 3
      );
    },
  );
}
