import { Stm } from "@effectstream/sm";
import type { BaseStfInput } from "@effectstream/sm";
import type { StartConfigGameStateTransitions } from "@effectstream/runtime";
import { type SyncStateUpdateStream, World } from "@effectstream/coroutine";
import { getUser, upsertUser } from "@web-2.5/database";
import { grammar } from "./grammar.ts";

const stm = new Stm<typeof grammar, {}>(grammar);

// Ported from game-logic/src/index.ts:
//   "mocked complicated server side logic" — each unit of gained experience is
//   worth 10 progress points. In the web2.5 model this represents off-chain
//   game logic the server runs before crediting XP via the batcher.
const calculateProgress = (prevExperience: number, gainedExperience: number) =>
  prevExperience + gainedExperience * 10;

// changedName: the signer renames their own user record (creating it if absent).
stm.addStateTransition("changedName", function* (data) {
  const signer = data.signerAddress;
  if (!signer) return;
  const wallet = signer.toLowerCase();

  const existing = yield* World.resolve(getUser, { wallet });
  const current = existing[0];

  yield* World.resolve(upsertUser, {
    wallet,
    name: data.parsedInput.name,
    experience: current?.experience ?? 0,
  });
});

// gainedExperience: the web2.5 path. The off-chain server submits this through
// the batcher; the batcher's gas-payer wallet signs it, so `signerAddress` is
// the batcher account. XP is credited to that signer's user record using the
// server-side progress formula.
stm.addStateTransition("gainedExperience", function* (data) {
  const signer = data.signerAddress;
  if (!signer) return;
  const wallet = signer.toLowerCase();

  const existing = yield* World.resolve(getUser, { wallet });
  const current = existing[0];

  yield* World.resolve(upsertUser, {
    wallet,
    name: current?.name ?? null,
    experience: calculateProgress(
      current?.experience ?? 0,
      data.parsedInput.experience,
    ),
  });
});

export const gameStateTransitions: StartConfigGameStateTransitions = function* (
  _blockHeight: number,
  input: BaseStfInput,
): SyncStateUpdateStream<void> {
  yield* stm.processInput(input);
};
