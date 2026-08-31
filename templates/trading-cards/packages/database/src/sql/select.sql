/* @name getLobbyById */
SELECT * FROM lobbies
WHERE lobby_id = :lobby_id!;

/* @name getOpenLobbies */
SELECT *
FROM lobbies
WHERE lobbies.lobby_state = 'open' AND lobbies.hidden IS FALSE
ORDER BY created_at DESC
LIMIT :count
OFFSET :page;

/* @name getLobbyPlayers */
SELECT *
FROM lobby_player
WHERE lobby_player.lobby_id = :lobby_id!
ORDER BY lobby_player.id;

/* @name getActiveLobbies */
SELECT * FROM lobbies
WHERE lobbies.lobby_state = 'active';

/* @name getMatch */
SELECT * FROM lobby_match
WHERE
  lobby_id = :lobby_id! AND
  match_within_lobby = :match_within_lobby!;

/* @name getRound */
SELECT *
FROM match_round
WHERE
  lobby_id = :lobby_id! AND
  match_within_lobby = :match_within_lobby! AND
  round_within_match = :round_within_match!;

/* @name getRoundMoves */
SELECT *
FROM round_move
WHERE
  lobby_id = :lobby_id! AND
  match_within_lobby = :match_within_lobby! AND
  round_within_match = :round_within_match!
ORDER BY round_move.move_within_round;

/* @name getUserStats */
SELECT * FROM global_user_state
WHERE nft_id = :nft_id;

/* @name getOwnedNft */
SELECT nft_id FROM nft_ownership
WHERE wallet_address = :wallet_address!
ORDER BY nft_id
LIMIT 1;

/* @name getNftsForWallet */
SELECT nft_id FROM nft_ownership
WHERE wallet_address = :wallet_address!
ORDER BY nft_id;

/* @name getOwnedCards */
SELECT * FROM cards
WHERE owner_nft_id = :owner_nft_id!
ORDER BY id;

/* @name checkOwnedCard */
SELECT * FROM cards
WHERE owner_nft_id = :owner_nft_id! AND id = :id!;

/* @name getCardPacks */
SELECT * FROM card_packs
WHERE buyer_nft_id = :buyer_nft_id!
ORDER BY id;

/* @name getTradeNft */
SELECT * FROM card_trade_nft
WHERE nft_id = :nft_id!;
