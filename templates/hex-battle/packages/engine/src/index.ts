// Hex Battle game engine — the q/r/s cube-coordinate hex board, units,
// buildings, movement/combat resolution and (de)serialization.
//
// Promoted out of the sync node (`packages/node/engine`) into a shared workspace
// package so BOTH the sync node (deterministic on-chain state transitions) and
// the frontend (canvas game + offline practice/AI mode) consume the exact same
// engine. The node imports the deterministic surface (Game, CreateGame, Moves,
// Player, …); the frontend additionally imports the client-only `AIPlayer`
// (used for offline practice and AI opponents — it never touches on-chain
// state). The node's deterministic deviations (Player-only rehydration in
// `Game.import`, adaptive map spacing + bounded placement loops in CreateGame,
// the tiny wallet-seeded `Name` generator) are preserved verbatim, so node
// behavior is unchanged by the move.
export * from './building';
export * from './game';
export * from './map';
export * from './moves';
export * from './player';
export * from './player.ai';
export * from './tile';
export * from './unit';
export * from './hex';
export * from './name';
export * from './create-game';
