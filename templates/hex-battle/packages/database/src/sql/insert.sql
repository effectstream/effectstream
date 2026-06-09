/* @name createLobby */
INSERT INTO lobby(
    lobby_id,
    num_of_players,
    current_round,
    created_at,
    creation_block_height,
    lobby_creator,
    lobby_state,
    game_state,
    game_winner,
    map,
    units,
    buildings,
    gold,
    init_tiles,
    time_limit,
    round_limit
) VALUES (
    :lobby_id!,
    :num_of_players!,
    0,
    :created_at!,
    :creation_block_height!,
    :lobby_creator!,
    'open',
    '',
    NULL,
    :map!,
    :units!,
    :buildings!,
    :gold!,
    :init_tiles!,
    :time_limit!,
    :round_limit!
);

/* @name addPlayerToLobby */
INSERT INTO lobby_player(lobby_id, player_wallet)
VALUES (:lobby_id!, :player_wallet!);

/* @name createRound */
INSERT INTO round(lobby_id, wallet, move, round, block_height, seed)
VALUES (:lobby_id!, :wallet!, :move!, :round!, :block_height!, :seed);

/* @name createPlayer */
INSERT INTO player(wallet, last_block_height)
VALUES (:wallet!, :block_height!)
ON CONFLICT (wallet) DO NOTHING;
