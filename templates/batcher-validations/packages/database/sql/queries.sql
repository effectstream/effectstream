/* @name getGateStatus */
SELECT accepting FROM gate_config WHERE id = 1;

/* @name setGateStatus */
UPDATE gate_config SET accepting = :accepting! WHERE id = 1;

/* @name insertCommand */
INSERT INTO commands (sender, message, block_height)
VALUES (:sender!, :message!, :block_height!);

/* @name getCommands */
SELECT * FROM commands ORDER BY id DESC;
