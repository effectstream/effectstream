import { Type } from "@sinclair/typebox";

export const GetLobbyStateQuerystringSchema = Type.Object({
  lobbyID: Type.String(),
});

export const RemainingBlocksSchema = Type.Object({
  w: Type.Number(),
  b: Type.Number(),
});

export const LobbyStateQuerySchema = Type.Object({
  bot_difficulty: Type.Number(),
  created_at: Type.Date(),
  creation_block_height: Type.Number(),
  current_round: Type.Number(),
  hidden: Type.Boolean(),
  latest_match_state: Type.String(),
  lobby_creator: Type.String(),
  lobby_id: Type.String(),
  lobby_state: Type.String(),
  num_of_rounds: Type.Number(),
  play_time_per_player: Type.Number(),
  player_one_iswhite: Type.Boolean(),
  player_two: Type.Union([Type.String(), Type.Null()]),
  practice: Type.Boolean(),
  round_length: Type.Number(),
  round_start_height: Type.Number(),
  remaining_blocks: RemainingBlocksSchema,
});

export const GetLobbyStateResponseSchema = Type.Object({
  lobby: Type.Union([LobbyStateQuerySchema, Type.Null()]),
});

// Query strings cannot carry numbers, as type is lost.
// This converts from strings to expected types (numbers)
const _PositiveNumberString = (options: { default: string }) =>
  Type.Union([
    Type.String({
      pattern: "^[0-9]+$", // Regex for integers
      errorMessage: "Value must be a string containing a valid positive number",
      default: options.default,
    }),
  ]);
  
const CoercibleNumber = (options: { default: string }) =>
  Type.Transform(_PositiveNumberString(options))
    .Decode((value) => parseInt(value as string, 10))
    .Encode((value) => String(value));

export const GetUserLobbiesBlockheightQuerystringSchema = Type.Object({
  wallet: Type.String(),
  blockHeight: CoercibleNumber({ default: "0" }),
});

export const UserLobbiesBlockheightLobbySchema = Type.Object({
  lobby_id: Type.String(),
});

export const GetUserLobbiesBlockheightResponseSchema = Type.Object({
  lobbies: Type.Array(UserLobbiesBlockheightLobbySchema),
});

export const GetOpenLobbiesQuerystringSchema = Type.Object({
  wallet: Type.String(),
  count: CoercibleNumber({ default: "10" }),
  page: CoercibleNumber({ default: "1" }),
});

export const OpenLobbySchema = Type.Object({
  created_at: Type.Date(),
  creation_block_height: Type.Number(),
  current_round: Type.Number(),
  hidden: Type.Boolean(),
  latest_match_state: Type.String(),
  lobby_creator: Type.String(),
  lobby_id: Type.String(),
  lobby_state: Type.String(),
  num_of_rounds: Type.Number(),
  play_time_per_player: Type.Number(),
  player_one_iswhite: Type.Boolean(),
  rating: Type.Number(),
  round_length: Type.Number(),
});

export const GetOpenLobbiesResponseSchema = Type.Object({
  lobbies: Type.Array(OpenLobbySchema),
});

export const GetUserLobbiesQuerystringSchema = Type.Object({
  wallet: Type.String(),
  count: CoercibleNumber({ default: "10" }),
  page: CoercibleNumber({ default: "1" }),
});

export const UserLobbySchema = Type.Object({
  bot_difficulty: Type.Number(),
  created_at: Type.Date(),
  creation_block_height: Type.Number(),
  current_round: Type.Number(),
  hidden: Type.Boolean(),
  latest_match_state: Type.String(),
  lobby_creator: Type.String(),
  lobby_id: Type.String(),
  lobby_state: Type.String(),
  num_of_rounds: Type.Number(),
  play_time_per_player: Type.Number(),
  player_one_iswhite: Type.Boolean(),
  player_two: Type.Union([Type.String(), Type.Null()]),
  practice: Type.Boolean(),
  round_length: Type.Number(),
});

export const GetUserLobbiesResponseSchema = Type.Object({
  lobbies: Type.Array(UserLobbySchema),
});

export const GetMatchExecutorQuerystringSchema = Type.Object({
  lobbyID: Type.String(),
});

export const MatchExecutorLobbySchema = Type.Object({
  bot_difficulty: Type.Number(),
  created_at: Type.Date(),
  creation_block_height: Type.Number(),
  current_round: Type.Number(),
  hidden: Type.Boolean(),
  latest_match_state: Type.String(),
  lobby_creator: Type.String(),
  lobby_id: Type.String(),
  lobby_state: Type.String(),
  num_of_rounds: Type.Number(),
  play_time_per_player: Type.Number(),
  player_one_iswhite: Type.Boolean(),
  player_two: Type.Union([Type.String(), Type.Null()]),
  practice: Type.Boolean(),
  round_length: Type.Number(),
});

export const MatchExecutorMoveSchema = Type.Object({
  id: Type.Number(),
  lobby_id: Type.String(),
  move_pgn: Type.String(),
  round: Type.Number(),
  wallet: Type.String(),
});

export const MatchExecutorSeedSchema = Type.Object({
  seed: Type.String(),
  block_height: Type.Number(),
  round: Type.Number(),
});

export const MatchExecutorDataSchema = Type.Object({
  lobby: MatchExecutorLobbySchema,
  seeds: Type.Array(MatchExecutorSeedSchema),
  moves: Type.Array(MatchExecutorMoveSchema),
});

export const GetMatchExecutorResponseSchema = Type.Union([
  MatchExecutorDataSchema,
  Type.Null(),
]);

export const SearchOpenLobbiesQuerystringSchema = Type.Object({
  wallet: Type.String(),
  searchQuery: Type.String(),
  page: CoercibleNumber({ default: "1" }),
  count: CoercibleNumber({ default: "10" }),
});

export const SearchOpenLobbiesLobbySchema = Type.Object({
  created_at: Type.Date(),
  creation_block_height: Type.Number(),
  current_round: Type.Number(),
  hidden: Type.Boolean(),
  latest_match_state: Type.String(),
  lobby_creator: Type.String(),
  lobby_id: Type.String(),
  lobby_state: Type.String(),
  num_of_rounds: Type.Number(),
  play_time_per_player: Type.Number(),
  player_one_iswhite: Type.Boolean(),
  round_length: Type.Number(),
  rating: Type.Optional(Type.Number()),
});

export const SearchOpenLobbiesResponseSchema = Type.Object({
  lobbies: Type.Array(SearchOpenLobbiesLobbySchema),
});

export const GetRoundStatusQuerystringSchema = Type.Object({
  lobbyID: Type.String(),
  round: CoercibleNumber({ default: "0" }),
});

export const RoundStatusDataSchema = Type.Object({
  executed: Type.Boolean(),
  usersWhoSubmittedMoves: Type.Array(Type.String()),
  roundStarted: Type.Number(),
  roundLength: Type.Number(),
});

export const RoundStatusErrorSchema = Type.Object({
  error: Type.Union([
    Type.Literal("round not found"),
    Type.Literal("lobby not found"),
  ]),
});

export const GetRoundStatusResponseSchema = Type.Union([
  RoundStatusDataSchema,
  RoundStatusErrorSchema,
]);

export const GetUserStatsQuerystringSchema = Type.Object({
  wallet: Type.String(),
});

export const UserStatsSchema = Type.Object({
  losses: Type.Number(),
  rating: Type.Number(),
  ties: Type.Number(),
  wallet: Type.String(),
  wins: Type.Number(),
});

export const GetUserStatsResponseSchema = Type.Object({
  stats: Type.Union([UserStatsSchema, Type.Null()]),
  rank: Type.Optional(Type.String()),
});

export const GetMatchWinnerQuerystringSchema = Type.Object({
  lobbyID: Type.String(),
});

export const GetMatchWinnerResponseSchema = Type.Object({
  match_status: Type.Optional(Type.String()),
  winner_address: Type.Optional(Type.String()),
});

export const RandomActiveLobbySchema = Type.Object({
  bot_difficulty: Type.Number(),
  created_at: Type.Date(),
  creation_block_height: Type.Number(),
  current_round: Type.Number(),
  hidden: Type.Boolean(),
  latest_match_state: Type.String(),
  lobby_creator: Type.String(),
  lobby_id: Type.String(),
  lobby_state: Type.String(),
  num_of_rounds: Type.Number(),
  play_time_per_player: Type.Number(),
  player_one_iswhite: Type.Boolean(),
  player_two: Type.Union([Type.String(), Type.Null()]),
  practice: Type.Boolean(),
  round_length: Type.Number(),
});

export const GetRandomActiveLobbyResponseSchema = Type.Object({
  lobby: Type.Union([RandomActiveLobbySchema, Type.Null()]),
});

export const RandomLobbySchema = Type.Object({
  created_at: Type.Date(),
  creation_block_height: Type.Number(),
  current_round: Type.Number(),
  hidden: Type.Boolean(),
  latest_match_state: Type.String(),
  lobby_creator: Type.String(),
  lobby_id: Type.String(),
  lobby_state: Type.String(),
  num_of_rounds: Type.Number(),
  play_time_per_player: Type.Number(),
  player_one_iswhite: Type.Boolean(),
  round_length: Type.Number(),
});

export const GetRandomLobbyResponseSchema = Type.Object({
  lobby: Type.Union([RandomLobbySchema, Type.Null()]),
});

export const GetRoundExecutorQuerystringSchema = Type.Object({
  lobbyID: Type.String(),
  round: CoercibleNumber({ default: "0" }),
});

export const RoundExecutorLobbySchema = Type.Object({
  bot_difficulty: Type.Number(),
  created_at: Type.Date(),
  creation_block_height: Type.Number(),
  current_round: Type.Number(),
  hidden: Type.Boolean(),
  latest_match_state: Type.String(),
  lobby_creator: Type.String(),
  lobby_id: Type.String(),
  lobby_state: Type.String(),
  num_of_rounds: Type.Number(),
  play_time_per_player: Type.Number(),
  player_one_iswhite: Type.Boolean(),
  player_two: Type.Union([Type.String(), Type.Null()]),
  practice: Type.Boolean(),
  round_length: Type.Number(),
});

export const RoundExecutorMoveSchema = Type.Object({
  id: Type.Number(),
  lobby_id: Type.String(),
  move_pgn: Type.String(),
  round: Type.Number(),
  wallet: Type.String(),
});

export const RoundExecutorBlockHeightSchema = Type.Object({
  seed: Type.String(),
  done: Type.Boolean(),
  block_height: Type.Number(),
});

export const RoundExecutorDataSchema = Type.Object({
  lobby: RoundExecutorLobbySchema,
  match_state: Type.String(),
  moves: Type.Array(RoundExecutorMoveSchema),
  block_height: RoundExecutorBlockHeightSchema,
});

export const RoundExecutorErrorSchema = Type.Object({
  error: Type.Union([
    Type.Literal("lobby not found"),
    Type.Literal("bad round number"),
    Type.Literal("round not found"),
  ]),
});

export const GetRoundExecutorResponseSchema = Type.Union([
  RoundExecutorDataSchema,
  RoundExecutorErrorSchema,
]);
