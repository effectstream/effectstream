import { Type } from "@sinclair/typebox";
import type { GrammarDefinition } from "@effectstream/concise";

export const grammar = {
  createdLobby: [
    ["numOfRounds", Type.Number()],
    ["roundLength", Type.Number()],
    ["playTimePerPlayer", Type.Number()],
    ["isHidden", Type.Boolean({ default: false })],
    ["isPractice", Type.Boolean({ default: false })],
    ["botDifficulty", Type.Number()],
    ["playerOneIsWhite", Type.Boolean({ default: true })],
  ],
  joinLobby: [
    ["lobbyID", Type.String()],
  ],
  closeLobby: [
    ["lobbyID", Type.String()],
  ],
  submitMoves: [
    ["lobbyID", Type.String()],
    ["roundNumber", Type.Number()],
    ["pgnMove", Type.String()],
  ],
  z /* zombieScheduledData */: [
    ["lobbyID", Type.String()],
  ],
  u /* userScheduledData */: [
    ["user", Type.String()],
    ["result", Type.String()],
    ["ratingChange", Type.Number()],
  ],
  sb /* scheduledBotMove */: [
    ["lobbyID", Type.String()],
    ["roundNumber", Type.Number()],
  ],
} as const satisfies GrammarDefinition;
