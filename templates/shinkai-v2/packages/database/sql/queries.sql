/* @name getUserStats */
SELECT * FROM global_user_state
WHERE wallet = :wallet;

/* @name getWorldStats */
SELECT * FROM global_world_state;

/* @name getGameById */
SELECT * FROM game
WHERE id = :id!;

/* @name getNewGame */
SELECT * FROM game
WHERE wallet = :wallet!
AND stage = 'new'
ORDER BY id DESC
LIMIT 1;

/* @name getQuestionAnswer */
SELECT * FROM question_answer
WHERE game_id = :game_id!
AND stage = :stage!;

/* @name getAllQuestionAnswer */
SELECT * FROM question_answer
WHERE game_id = :game_id!;

/* @name createGlobalUserState */
INSERT INTO global_user_state (wallet)
VALUES (:wallet!)
ON CONFLICT (wallet) DO NOTHING;

/* @name newGame */
INSERT INTO game (wallet)
VALUES (:wallet!);

/* @name newQuestionAnswer */
INSERT INTO question_answer (game_id, stage, question)
VALUES (:game_id!, :stage!, :question!);

/* @name setAnswer */
UPDATE question_answer
SET answer = :answer!, score = :score!
WHERE game_id = :game_id!
AND stage = :stage!;

/* @name updateGame */
UPDATE game
SET stage = :stage!, block_height = :block_height!, prize = :prize
WHERE id = :id!;

/* @name updateUserGlobalPosition */
UPDATE global_user_state
SET tokens = tokens + :change!
WHERE wallet = :wallet!;

/* @name updateTokens */
UPDATE global_world_state
SET tokens = tokens + :change!;
