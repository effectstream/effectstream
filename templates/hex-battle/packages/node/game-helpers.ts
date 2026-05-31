// Pure Hex Battle helpers. These port the custom PaimaParser field-validators
// from the v1 backend (state-transition/src/stf/v1/parser.ts) — `buildings`,
// `map`, `units`, and the `move` mini-language — into plain functions that the
// STM transitions call after Typebox has validated the scalar fields.
//
// They also wrap the folded-in hex engine (./engine) so the STM can build a
// fresh game, apply a move, and decide win/draw without the engine's
// client-side AI or executor abstraction.

import {
  Tile,
  GameMap,
  Player,
  Game,
  CreateGame,
  Moves,
  type UnitType,
  type BuildingType,
} from "./engine/index.ts";

export type LobbyState = "open" | "active" | "finished" | "closed";

export type QRS = { q: number; r: number; s: number };

// ---------------------------------------------------------------------------
// createLobby field validators (ported from v1 parser.ts)
// ---------------------------------------------------------------------------

/** units must match /^[ABCD]*$/ (the four unit-power glyphs). */
export function validateUnits(units: string): boolean {
  return /^[ABCD]*$/.test(units);
}

/**
 * buildings must be made of glyphs b/F/T/t and contain exactly one base ('b').
 * Mirrors the v1 `buildings` field-validator (errors I–IV).
 */
export function validateBuildings(buildings: string): boolean {
  if (!buildings || !buildings.length) return false;
  const valid = ["b", "F", "T", "t"];
  let baseCount = 0;
  for (const b of buildings.split("")) {
    if (!valid.includes(b)) return false;
    if (b === "b") baseCount++;
  }
  return baseCount === 1;
}

/**
 * Parse the v1 `map` mini-language: "q#r,q#r,..." into a list of {q,r,s} cube
 * coordinates (s is derived as -(q+r)). Returns null if any coordinate is
 * malformed. Mirrors the v1 `map` field-validator.
 */
export function parseMap(map: string): QRS[] | null {
  if (!map) return null;
  const coords: QRS[] = [];
  for (const part of map.split(",")) {
    const parts = part.split("#");
    if (parts.length !== 2) return null;
    const q = parseInt(parts[0], 10);
    const r = parseInt(parts[1], 10);
    if (String(q) !== parts[0]) return null;
    if (String(r) !== parts[1]) return null;
    coords.push({ q, r, s: -(q + r) });
  }
  return coords.length ? coords : null;
}

/**
 * Serialize a parsed map back to the canonical JSON the engine expects to be
 * stored in `lobby.map` (the v1 parser stored `JSON.stringify(coords)`).
 */
export function mapToStored(coords: QRS[]): string {
  return JSON.stringify(coords);
}

// ---------------------------------------------------------------------------
// submitMoves `move` mini-language (ported from v1 parser.ts)
// ---------------------------------------------------------------------------
//
// A move is a comma-joined list of actions, each one of:
//   - "surrender"                    -> { surrender: true }
//   - "<glyph><q>#<r>"               -> build unit/building at target
//                                       glyph in ABCD (unit) | FtT (building)
//   - "<tq>#<tr>#<oq>#<or>"          -> move a unit from origin to target
//
// We parse it into the same JSON-stringified action array that the engine's
// Moves.deserializePaima() consumes.
export function parseMove(move: string): string[] | null {
  const actions: string[] = [];
  for (const part of move.split(",")) {
    if (part === "surrender") {
      actions.push(JSON.stringify({ surrender: true }));
      continue;
    }
    const build = part.match(/^([ABCDFtT])(-?\d+)#(-?\d+)$/);
    if (build) {
      const targetQ = parseInt(build[2], 10);
      const targetR = parseInt(build[3], 10);
      const targetS = -(targetQ + targetR);
      actions.push(JSON.stringify({ targetQ, targetR, targetS, build: build[1] }));
      continue;
    }
    const mv = part.match(/^(-?\d+)#(-?\d+)#(-?\d+)#(-?\d+)$/);
    if (mv) {
      const targetQ = parseInt(mv[1], 10);
      const targetR = parseInt(mv[2], 10);
      const targetS = -(targetQ + targetR);
      const originQ = parseInt(mv[3], 10);
      const originR = parseInt(mv[4], 10);
      const originS = -(originQ + originR);
      actions.push(
        JSON.stringify({ targetQ, targetR, targetS, originQ, originR, originS }),
      );
      continue;
    }
    return null; // invalid action token
  }
  return actions;
}

// ---------------------------------------------------------------------------
// Engine wrappers (replace the v1 startGame / validateMovesAndApply helpers)
// ---------------------------------------------------------------------------

interface RandomGenerator {
  nextInt(min: number, max: number): number;
  _seed?: number;
}

/**
 * Build a fresh hex game from a created lobby's parameters + the joined players.
 * Returns the engine `Game` whose state should be exported into `lobby.game_state`.
 */
export function startGame(
  lobbyId: string,
  storedMap: string,
  units: string,
  buildings: string,
  initTiles: number,
  playerWallets: string[],
  initialGold: number,
  blockHeight: number,
  rand: RandomGenerator,
): Game {
  const coords: QRS[] = JSON.parse(storedMap);
  const tiles = coords
    .filter(
      (c) =>
        c.q === parseInt(String(c.q), 10) &&
        c.r === parseInt(String(c.r), 10) &&
        c.s === parseInt(String(c.s), 10),
    )
    .map((c) => new Tile(c.q, c.r, c.s));

  const map = new GameMap(tiles);
  map.updateLimits();

  const players = playerWallets.map(
    (wallet, i) => new Player(Player.PlayerIndexes[i], initialGold, wallet),
  );

  return CreateGame.newGame(
    lobbyId,
    "",
    map,
    players,
    units.split("") as UnitType[],
    buildings.split("") as BuildingType[],
    initTiles,
    blockHeight,
    rand,
  );
}

/**
 * Apply a parsed move (array of stringified actions) for `user` to the imported
 * game and end the turn. Returns the mutated `Game` or null if any action is
 * illegal (the whole submission is rejected, matching v1 semantics).
 */
export function applyMove(
  gameState: string,
  user: string,
  moveActions: string[],
  roundNumber: number,
): Game | null {
  try {
    const game = Game.import(gameState);
    const move = Moves.deserializePaima(game, {
      move: JSON.stringify(moveActions),
      round: roundNumber,
      wallet: user,
    });
    game.initMoves(move.player);

    for (const action of move.actions) {
      const player = game.players.find((p) => p.wallet === user);
      if (!player) throw new Error("Player not found");
      if (game.getCurrentPlayer().wallet !== user) {
        throw new Error("Not player turn");
      }

      const originTile = game.map.tiles.find((t) => t.same(action.origin));
      const targetTile = game.map.tiles.find((t) => t.same(action.target));

      switch (action.type) {
        case "move":
          if (!originTile || !targetTile) throw new Error("Tile not found");
          game.moveUnit(player, originTile, targetTile);
          break;
        case "new_unit":
          if (!targetTile) throw new Error("Tile not found");
          if (!action.newUnitType) throw new Error("Unit type not found");
          game.placeUnit(player, targetTile, action.newUnitType);
          break;
        case "new_building":
          if (!targetTile) throw new Error("Tile not found");
          if (!action.newBuildingType) {
            throw new Error("Building type not found");
          }
          game.placeBuilding(player, targetTile, action.newBuildingType);
          break;
        case "surrender":
          game.surrender(player);
          break;
        default:
          throw new Error("Invalid action type");
      }
    }

    game.endTurn();
    return game;
  } catch (e) {
    console.log("Hex Battle: move rejected:", (e as Error).message);
    return null;
  }
}

/**
 * Apply an empty (skipped) turn for the current player — used by the zombie
 * (timeout) transition. Returns the mutated game.
 */
export function applySkip(gameState: string, roundNumber: number): Game {
  const game = Game.import(gameState);
  const skippedWallet = game.getCurrentPlayer().wallet;
  const move = Moves.deserializePaima(game, {
    move: JSON.stringify([]),
    round: roundNumber,
    wallet: skippedWallet,
  });
  game.initMoves(move.player);
  game.endTurn();
  return game;
}

export { Game };
