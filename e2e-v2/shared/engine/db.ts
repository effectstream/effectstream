export type QueryResult<RowType> = {
  rows: RowType[];
  fields: { name: string; dataTypeId: number }[];
  rowCount: number;
  command: string;
  oid: number;
  rowsAffected: number;
};

function getApiPort(): number {
  const port = process.env["EFFECTSTREAM_API_PORT"];
  return port ? parseInt(port, 10) : 9999;
}

export async function safeQuery<T>(
  db: any,
  query: string,
  testName: string,
): Promise<QueryResult<T>> {
  let result: QueryResult<T>;
  let didLock = false;
  const apiPort = getApiPort();
  try {
    await fetch(
      `http://localhost:${apiPort}/db_acquire_lock?name=${testName}`,
    );
    didLock = true;
    result = await dbQuery<any>(db.query<any>(query));
  } finally {
    if (didLock) {
      await fetch(
        `http://localhost:${apiPort}/db_release_lock?name=${testName}`,
      );
    }
  }
  return result;
}

const IS_PGLITE = process.env["PGLITE"] === "true" || process.env["PGLITE"] === "1";

async function dbQuery<T>(
  p: Promise<QueryResult<T>>,
) {
  let t: ReturnType<typeof setTimeout>;
  const timeout: Promise<QueryResult<T>> = new Promise(
    (resolve) => {
      t = setTimeout(() => {
        console.error("[E2E CRITICAL ERROR] Database query timed out");
        if (IS_PGLITE) {
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
  clearTimeout(t!);
  return result;
}
