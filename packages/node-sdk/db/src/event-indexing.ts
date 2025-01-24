import type { PoolClient } from "pg";

export async function createIndexesForEvents(
  pool: PoolClient,
  eventDescriptions: { topic: string; fieldName: string; indexed: boolean }[],
): Promise<boolean> {
  for (const event of eventDescriptions) {
    const indexName = `index_${
      event.topic.slice(0, 20)
    }_${event.fieldName.toLowerCase()}`;

    const checkQuery =
      `SELECT * FROM pg_indexes WHERE indexname = '${indexName}';`;

    const result = await pool.query(checkQuery);

    const createQuery =
      `CREATE INDEX ${indexName} ON event(topic, (data->>'${event.fieldName}'));`;
    const deleteQuery = `DROP INDEX ${indexName};`;

    if (result.rowCount === 0 && event.indexed) {
      await pool.query(createQuery);
    }

    if (result.rowCount !== 0 && !event.indexed) {
      await pool.query(deleteQuery);
    }
  }

  return true;
}
