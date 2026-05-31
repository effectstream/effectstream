/* @name getUser */
SELECT * FROM users
WHERE users.wallet = :wallet!;

/* @name getAllUsers */
SELECT * FROM users ORDER BY experience DESC;

/* @name upsertUser */
INSERT INTO users(wallet, name, experience)
VALUES (:wallet!, :name, :experience!)
ON CONFLICT (wallet)
DO UPDATE SET
experience = EXCLUDED.experience,
name = EXCLUDED.name;
