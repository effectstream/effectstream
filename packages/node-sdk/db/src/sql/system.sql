/* @name getTableSchema */
SELECT 
column_name, data_type, character_maximum_length, column_default, is_nullable
FROM 
INFORMATION_SCHEMA.COLUMNS 
WHERE 
table_name = :tableName!
;
