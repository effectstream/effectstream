/* @name getPage */
SELECT * FROM paima.sync_protocol_pagination
WHERE protocol_name = :protocol_name!;



/* @name upsertPage */
INSERT INTO
    paima.sync_protocol_pagination (
        protocol_name,
        page
    )
VALUES (
    :protocol_name!,
    :page!
);