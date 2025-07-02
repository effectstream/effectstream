/* @name findNonce */
SELECT * FROM nonces
WHERE nonce = :nonce;

/* @name deleteNonces */
DELETE FROM nonces
WHERE block_height <= :limit_block_height!;

/* @name insertNonce */
INSERT INTO nonces(nonce, block_height)
VALUES (:nonce!, :block_height!);
