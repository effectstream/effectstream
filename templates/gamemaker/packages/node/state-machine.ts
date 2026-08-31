import { Stm } from "@effectstream/sm";
import type { BaseStfInput } from "@effectstream/sm";
import type { StartConfigGameStateTransitions } from "@effectstream/runtime";
import { type SyncStateUpdateStream, World } from "@effectstream/coroutine";
import { getUser, upsertUser } from "@gamemaker/database";
import { grammar } from "./grammar.ts";

// Ported from paima-engine-v1 `game-logic/src/index.ts`:
//   export const calculateProgress = (prevExperience, gainedExperience) =>
//     prevExperience + gainedExperience * 10;
function calculateProgress(prevExperience: number, gainedExperience: number) {
  return prevExperience + gainedExperience * 10;
}

const stm = new Stm<typeof grammar, {}>(grammar);

// Ported from v1 `state-transition/src/stf/v1/transition.ts` (gainExperience)
// + `persist/user.ts` (persistUserUpdate). Looks up the signer's current XP,
// adds `experience * 10`, and upserts. Wallet comes from `signerAddress`
// (was the v1 `*address` grammar field).
stm.addStateTransition("gainedExperience", function* (data) {
  const { signerAddress, parsedInput } = data;
  const wallet = signerAddress.toLowerCase();

  const existing = yield* World.resolve(getUser, { wallet });
  const prevExperience = existing[0]?.experience ?? 0;

  yield* World.resolve(upsertUser, {
    stats: {
      wallet,
      experience: calculateProgress(prevExperience, parsedInput.experience),
    },
  });
});

export const gameStateTransitions: StartConfigGameStateTransitions = function* (
  _blockHeight: number,
  input: BaseStfInput,
): SyncStateUpdateStream<void> {
  yield* stm.processInput(input);
};
