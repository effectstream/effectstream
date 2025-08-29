/* @name getPrimaryKeyColumns */
SELECT a.attname as "column_name"
FROM   pg_index i
JOIN   pg_attribute a ON a.attrelid = i.indrelid
                    AND a.attnum = ANY(i.indkey)
WHERE  i.indrelid = CAST(:tableName AS TEXT)::regclass
AND    i.indisprimary;

/* @name getPublicTables */
SELECT table_name
FROM   information_schema.tables
WHERE  table_schema = 'public';

/* @name getDynamicTables */
SELECT table_name
FROM   information_schema.tables
WHERE  table_schema = 'primitives';
