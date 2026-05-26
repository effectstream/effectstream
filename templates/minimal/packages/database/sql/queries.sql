/* @name insertInput */
INSERT INTO inputs_log (signer, payload, block_height)
VALUES (:signer!, :payload!, :block_height!);

/* @name getAllInputs */
SELECT * FROM inputs_log
ORDER BY id DESC
LIMIT 100;
