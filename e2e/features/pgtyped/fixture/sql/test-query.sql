/* @name getAllPgtypedTest */
SELECT id, name, block_height FROM pgtyped_test;

/* @name getTestWithMigrationCheck */
SELECT t.id, t.name, t.block_height, m.name AS migration_name
FROM pgtyped_test t
CROSS JOIN effectstream.effectstream_migration_history m
LIMIT 1;
