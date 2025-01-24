/* @name getPage */
SELECT * FROM sync_protocol_pagination
WHERE protocol_name = :protocol_name!;

/* @name upsertPage */
INSERT INTO
    sync_protocol_pagination (
        protocol_name,
        page
    )
VALUES (
    :protocol_name!,
    :page!
);