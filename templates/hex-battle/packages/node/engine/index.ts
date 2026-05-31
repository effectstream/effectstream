// Hex Battle game engine — the q/r/s cube-coordinate hex board, units,
// buildings, movement/combat resolution and (de)serialization.
//
// Folded in from the original `@hexbattle/engine` package during the
// effectstream migration. It is template-internal game logic (NOT a separately
// published package), used directly by the STM transitions in
// ../state-machine.ts. The client-side AI player (`player.ai.ts`) and the giant
// word-list name generator (`name.ts`) were dropped/trimmed: the deterministic
// on-chain engine has no AI, and names are now a tiny wallet-seeded hash.
export * from './building';
export * from './game';
export * from './map';
export * from './moves';
export * from './player';
export * from './tile';
export * from './unit';
export * from './hex';
export * from './name';
export * from './create-game';
