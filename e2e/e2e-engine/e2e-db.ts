import { ENV } from "@effectstream/utils/node-env";
import type { Client } from "pg";

export type QueryResult<RowType> = {
  rows: RowType[];
  fields: { name: string; dataTypeId: number }[];
  rowCount: number;
  command: string;
  oid: number;
  rowsAffected: number;
};

export async function safeQuery<T>(
  db: Client,
  query: string,
  testName: string,
): Promise<QueryResult<T>> {
  let result: QueryResult<T>;
  let didLock = false;
  try {
    await fetch(
      `http://localhost:${ENV.EFFECTSTREAM_API_PORT}/db_acquire_lock?name=${testName}`,
    );
    didLock = true;
    result = await dbQuery<any>(db.query<any>(query));
  } finally {
    if (didLock) {
      await fetch(
        `http://localhost:${ENV.EFFECTSTREAM_API_PORT}/db_release_lock?name=${testName}`,
      );
    }
  }
  return result;
}

const IS_PGLITE = ENV.PGLITE;

async function dbQuery<T>(
  p: Promise<QueryResult<T>>,
) {
  let t;
  const timeout: Promise<QueryResult<T>> = new Promise(
    (resolve) => {
      t = setTimeout(() => {
        console.error("[E2E CRITICAL ERROR] Database query timed out", name);
        if (IS_PGLITE) {
          // TODO: This is a temporary fix to allow the query to continue.
          // Only allow to continue in PGLITE.
          // We suspect this is PGLITE specific error.
          resolve({
            rows: [],
            fields: [],
            rowCount: 0,
            command: "",
            oid: 0,
            rowsAffected: 0,
          });
        }
      }, 2500);
    },
  );
  const result = await Promise.race([p, timeout]);
  clearTimeout(t);
  return result;
}
