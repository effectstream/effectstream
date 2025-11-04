/* @name getPage */
SELECT * FROM effectstream.sync_protocol_pagination
WHERE protocol_name = :protocol_name!
ORDER BY page_number ASC
LIMIT 1;

/* @name getSyncAndLastPage */
SELECT
  protocol_name,
  MIN(page_number) AS synced_page,
  MAX(page_number) AS fetched_page
FROM
 effectstream.sync_protocol_pagination
GROUP BY
  protocol_name
ORDER BY
  protocol_name;


/* @name removePages */
DELETE FROM effectstream.sync_protocol_pagination
WHERE protocol_name = :protocol_name!
AND page_number < :page_number!;

/* @name upsertPage */
INSERT INTO
   effectstream.sync_protocol_pagination (
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