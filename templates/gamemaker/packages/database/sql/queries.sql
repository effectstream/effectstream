/* @name getUser */
SELECT * FROM users
WHERE users.wallet = :wallet!;

/*
  @name upsertUser
  @param stats -> (wallet!, experience!)
*/
INSERT INTO users
VALUES :stats
ON CONFLICT (wallet)
DO UPDATE SET
experience = EXCLUDED.experience;
