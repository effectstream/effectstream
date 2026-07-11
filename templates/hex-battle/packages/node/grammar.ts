import { Type } from "@sinclair/typebox";
import type { GrammarDefinition } from "@effectstream/concise";

// 12-char server-generated lobby id.
const LobbyID = Type.String({ minLength: 12, maxLength: 12 });

// Hex Battle grammar (5 actions). Ported from the paima-engine-v1 PaimaParser
// grammar:
//   createLobby         = c|numOfPlayers|units|buildings|gold|initTiles|map|timeLimit|roundLimit
//   joinLobby           = j|*lobbyID
//   submitMoves         = m|*lobbyID|roundNumber|move
//   surrender           = s|*lobbyID   (was parsed but routed through submitMoves' "surrender" move)
//   zombieScheduledData = z|*lobbyID|roundNumber|count?
//
// The composite fields that the v1 parser validated with custom field-parsers —
// `buildings` (base-count + valid-glyph check), `map` (q#r,... coordinate list),
// and `move` (build/move/surrender mini-language) — are carried as plain
// strings here and validated/parsed inside the STM transitions (see
// game-helpers.ts: validateBuildings / parseMap / parseMove). Typebox can shape
// the scalars but not these domain-specific mini-languages, so the v1 validators
// were ported verbatim into game-helpers rather than approximated in the grammar.
export const grammar = {
  // createLobby: numOfPlayers|units|buildings|gold|initTiles|map|timeLimit|roundLimit
  createLobby: [
    ["numOfPlayers", Type.Number({ minimum: 2, maximum: 5 })],
    ["units", Type.String()], // /^[ABCD]*$/ — validated in the STM
    ["buildings", Type.String()], // glyphs b/F/T/t, exactly one base — validated in the STM
    ["gold", Type.Number({ minimum: 0, maximum: 9999 })],
    ["initTiles", Type.Number({ minimum: 1, maximum: 100 })],
    ["map", Type.String()], // "q#r,q#r,..." coordinate list — parsed in the STM
    ["timeLimit", Type.Number({ minimum: 10, maximum: 9999 })],
    ["roundLimit", Type.Number({ minimum: 10, maximum: 9999 })],
  ],

  // joinLobby: lobbyID
  joinLobby: [["lobbyID", LobbyID]],

  // submitMoves: lobbyID|roundNumber|move
  // `move` is the comma-joined action mini-language ("A0#0", "0#0#1#-1",
  // "surrender") — parsed by parseMove() in game-helpers and applied by the
  // hex engine.
  submitMoves: [
    ["lobbyID", LobbyID],
    ["roundNumber", Type.Number({ minimum: 0, maximum: 9999 })],
    ["move", Type.String()],
  ],

  // surrender: lobbyID — convenience action; resolves the current player out of
  // the game (same effect as a "surrender" move inside submitMoves).
  surrender: [["lobbyID", LobbyID]],

  // zombieScheduledData: lobbyID|roundNumber|count? — engine-scheduled timeout
  // that auto-advances a stalled turn (and ends the game after too many skips).
  zombieScheduledData: [
    ["lobbyID", LobbyID],
    ["roundNumber", Type.Number({ minimum: 0, maximum: 9999 })],
    ["count", Type.Optional(Type.Number({ minimum: 0, maximum: 9999 }))],
  ],
} as const satisfies GrammarDefinition;
