// This module wraps @pgtyped/runtime and exports a patched PreparedQuery
// To use this, add to deno.json imports:
// "@pgtyped/runtime": "./src/pgtyped-runtime-wrapper.ts"

export * from "npm:@pgtyped/runtime@2.4.2";
import { PreparedQuery as OriginalPreparedQuery } from "npm:@pgtyped/runtime@2.4.2";

const MODULE_VERSION = "v2025-12-15-T18:25:00";

console.error(`!!!!! PGTYPED WRAPPER LOADING (${MODULE_VERSION}) !!!!!`);

// Helper to escape SQL values
function escapeSqlValue(value: any): string {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'number') return String(value);
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (value instanceof Date) return `'${value.toISOString()}'`;
  return `'${String(value).replace(/'/g, "''")}'`;
}

// Wrap the constructor
const PatchedPreparedQuery: any = function(this: any, queryIR: any) {
  // Call original constructor
  (OriginalPreparedQuery as any).call(this, queryIR);

  // Patch this instance's run method if it needs parameter inlining
  if (queryIR?._rawSQL && queryIR?._pgliteParamsList) {
    const paramsList = queryIR._pgliteParamsList;

    this.run = async (params: any, dbConn: any) => {
      console.error(`>>>>>> ${MODULE_VERSION} INLINING PARAMETERS <<<<<<`);

      let statement = queryIR.statement;
      for (let i = 0; i < paramsList.length; i++) {
        const paramName = paramsList[i];
        const value = params[paramName];
        const escapedValue = escapeSqlValue(value);
        statement = statement.replace(`$${i + 1}`, escapedValue);
      }

      console.error("SQL:", statement.substring(0, 80) + "...");
      const result = await dbConn.query(statement, []);
      console.error("Success!");
      return result.rows || [];
    };
  }
};

PatchedPreparedQuery.prototype = OriginalPreparedQuery.prototype;

export { PatchedPreparedQuery as PreparedQuery };

console.error(`!!!!! PGTYPED WRAPPER LOADED (${MODULE_VERSION}) !!!!!`);
