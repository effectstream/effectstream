export const migrationTable = [
  {
    name: "001-create-test-table.sql",
    sql: `
      CREATE TABLE pgtyped_test (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        block_height INTEGER NOT NULL
      );
    `,
  },
];
