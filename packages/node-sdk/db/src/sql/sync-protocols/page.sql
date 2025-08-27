/* @name getPage */
SELECT * FROM paima.sync_protocol_pagination
WHERE protocol_name = :protocol_name!
ORDER BY page_number ASC
LIMIT 1;

/* @name removePages */
DELETE FROM paima.sync_protocol_pagination
WHERE protocol_name = :protocol_name!
AND page_number < :page_number!;

/* @name upsertPage */
INSERT INTO
    paima.sync_protocol_pagination (
        protocol_name,
        page_number,
        page
    )
VALUES (
    :protocol_name!,
    :page_number!,
    :page!
)
ON CONFLICT (protocol_name, page_number) DO UPDATE SET
    page = EXCLUDED.page
;