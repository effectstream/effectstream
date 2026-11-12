import { Stm } from "@effectstream/sm";
import type { BaseStfInput } from "@effectstream/sm";
import type { StartConfigGameStateTransitions } from "@effectstream/runtime";
import { type SyncStateUpdateStream, World } from "@effectstream/coroutine";
import {
  createCharacter,
  getCharacter,
  lvlUpCharacter,
} from "@nft-lvlup/database";
import { grammar } from "./grammar.ts";

const stm = new Stm<typeof grammar, {}>(grammar);

// ---------------------------------------------------------------------------
// nftMint — mint a character into the game state.
//
// parsedInput = { tokenId, type }
// The owner is the L2 transaction signer. We record a character row keyed by
// (owner, tokenId) starting at level 1 with the given elemental type.
// ---------------------------------------------------------------------------
stm.addStateTransition("nftMint", function* (data) {
  const { parsedInput, signerAddress } = data;
  const owner = signerAddress.toLowerCase();
  const nftId = String(parsedInput.tokenId);

  yield* World.resolve(createCharacter, {
    address: owner,
    nft_id: nftId,
    type: parsedInput.type,
  });
});

// ---------------------------------------------------------------------------
// lvlUp — increment a character's level.
//
// parsedInput = { tokenId }
// Only the character's owner (the signer) may level it up. We verify a
// character row exists for (signer, tokenId) before incrementing.
// ---------------------------------------------------------------------------
stm.addStateTransition("lvlUp", function* (data) {
  const { parsedInput, signerAddress } = data;
  const owner = signerAddress.toLowerCase();
  const nftId = String(parsedInput.tokenId);

  const existing = yield* World.resolve(getCharacter, {
    address: owner,
    nft_id: nftId,
  });
  if (!existing || existing.length === 0) {
    // Character not owned by this signer (or not minted yet) — ignore.
    return;
  }

  yield* World.resolve(lvlUpCharacter, {
    address: owner,
    nft_id: nftId,
  });
});

/**
 * Route inputs through the nft-lvlup state machine.
 */
export const gameStateTransitions: StartConfigGameStateTransitions = function* (
  _blockHeight: number,
  input: BaseStfInput,
): SyncStateUpdateStream<void> {
  yield* stm.processInput(input);
};
