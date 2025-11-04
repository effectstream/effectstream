/* @name findNonce */
SELECT * FROM effectstream.nonces
WHERE nonce = :nonce;

/* @name deleteNonces */
DELETE FROM effectstream.nonces
WHERE block_height <= :limit_block_height!;

/* @name insertNonce */
INSERT INTO effectstream.nonces(nonce, block_height)
VALUES (:nonce!, :block_height!);
