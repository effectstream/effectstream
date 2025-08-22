/* @name getPrimaryKeyColumns */
SELECT a.attname as "column_name"
FROM   pg_index i
JOIN   pg_attribute a ON a.attrelid = i.indrelid
                    AND a.attnum = ANY(i.indkey)
WHERE  i.indrelid = CAST(:tableName AS TEXT)::regclass
AND    i.indisprimary;
