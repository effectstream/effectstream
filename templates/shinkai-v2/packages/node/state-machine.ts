import { Stm } from "@effectstream/sm";
import type { BaseStfInput } from "@effectstream/sm";
import type { StartConfigAppStateTransitions } from "@effectstream/runtime";
import { type SyncStateUpdateStream, World } from "@effectstream/coroutine";
import { createScheduledData } from "@effectstream/db";
import {
  getUserStats,
  getWorldStats,
  getGameById,
  getQuestionAnswer,
  getAllQuestionAnswer,
  createGlobalUserState,
  newGame,
  newQuestionAnswer,
  setAnswer,
  updateGame,
  updateUserGlobalPosition,
  updateTokens,
} from "@shinkai-v2/database";
import { grammar } from "./grammar.ts";
import { ShinkaiClient } from "./shinkai-client.ts";
import { tigerPrompt, monkeyPrompt, bisonPrompt, pandaPrompt } from "./prompts.ts";

const BLOCK_TIME = 2;

const stm = new Stm<typeof grammar, {}>(grammar);

stm.addStateTransition("tick", function* (data) {
  const { parsedInput, blockHeight } = data;

  yield* World.resolve(updateTokens, { change: 20 });
  yield* World.promise(
    createScheduledData(
      JSON.stringify(["tick", parsedInput.n + 1]),
      blockHeight + Math.ceil(60 / BLOCK_TIME),
    ),
  );
});

stm.addStateTransition("newGame", function* (data) {
  const { signerAddress: user } = data;

  const [userData] = yield* World.resolve(getUserStats, { wallet: user });
  if (!userData) {
    yield* World.resolve(createGlobalUserState, { wallet: user });
  }
  yield* World.resolve(newGame, { wallet: user });
});

stm.addStateTransition("ai", function* (data) {
  const { parsedInput, signerAddress: user, blockHeight } = data;
  const { target, id, response } = parsedInput;

  const [game] = yield* World.resolve(getGameById, { id });
  if (!game) return;
  if (game.wallet !== user) return;

  const [existingQa] = yield* World.resolve(getQuestionAnswer, {
    game_id: id,
    stage: target,
  });
  if (existingQa) return;

  const [worldStats] = yield* World.resolve(getWorldStats, undefined);
  const maxTokens = Math.max(100, Math.min(worldStats?.tokens ?? 1000, 1000));

  let promptFn: (answer: string, type: "text" | "score") => string;
  switch (target) {
    case "tiger": promptFn = tigerPrompt; break;
    case "monkey": promptFn = monkeyPrompt; break;
    case "bison": promptFn = bisonPrompt; break;
    case "panda": promptFn = pandaPrompt; break;
    default: return;
  }

  let ai: string;
  let score: number;
  try {
    const shinkai = new ShinkaiClient();
    const [textResult, scoreResult] = yield* World.promise(
      Promise.all([
        shinkai.askQuestion(promptFn(response, "text")),
        shinkai.askQuestion(promptFn(response, "score")),
      ]),
    );
    ai = textResult.response;
    score = parseInt(scoreResult.response, 10) || 0;
  } catch {
    // Shinkai not configured — use stub so the game still advances
    ai = "The court acknowledges your answer.";
    score = 50;
  }

  const updateGameParams: {
    stage: string;
    block_height: number;
    id: number;
    prize?: number | null;
  } = { stage: target, block_height: blockHeight, id, prize: null };

  if (target === "panda") {
    const court = yield* World.resolve(getAllQuestionAnswer, { game_id: id });
    const multiplier = court
      .map((c) => c.score)
      .filter((c): c is number => c != null)
      .reduce((a, b) => a + b, 0);

    updateGameParams.prize = (((score ?? 0) / 100) * maxTokens * (multiplier / 100)) | 0;

    yield* World.resolve(updateUserGlobalPosition, { change: maxTokens, wallet: user });
    yield* World.resolve(updateTokens, { change: -1 * maxTokens });
  }

  yield* World.resolve(updateGame, updateGameParams);
  yield* World.resolve(newQuestionAnswer, { game_id: id, stage: target, question: response });
  yield* World.resolve(setAnswer, { game_id: id, answer: ai, score, stage: target });
});

export const appStateTransitions: StartConfigAppStateTransitions = function* (
  blockHeight: number,
  input: BaseStfInput,
): SyncStateUpdateStream<void> {
  yield* stm.processInput(input);
};
