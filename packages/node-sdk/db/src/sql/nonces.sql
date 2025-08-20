/* @name findNonce */
SELECT * FROM paima.nonces
WHERE nonce = :nonce;

/* @name deleteNonces */
DELETE FROM paima.nonces
WHERE block_height <= :limit_block_height!;

/* @name insertNonce */
INSERT INTO paima.nonces(nonce, block_height)
VALUES (:nonce!, :block_height!);
