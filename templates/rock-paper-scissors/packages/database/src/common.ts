// Common types and constants for database queries
// https://github.com/adelsz/pgtyped/issues/564

// Custom enums matching database types
export type LobbyStatus = 'open' | 'active' | 'finished' | 'closed';
export type MatchResult = 'win' | 'tie' | 'loss';
export type RockPaperScissors = 'R' | 'P' | 'S';
