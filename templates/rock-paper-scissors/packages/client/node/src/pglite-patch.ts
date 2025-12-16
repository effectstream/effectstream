// This module MUST be imported before @paimaexample/runtime
// It patches PreparedQuery to handle PGlite's lack of parameterized query support

import { PreparedQuery } from "@pgtyped/runtime";

const MODULE_VERSION = "v2025-12-15-T18:13:00";

console.error(`!!!!! PGLITE PATCH LOADING (${MODULE_VERSION}) !!!!!`);

// Helper to escape SQL values for inline substitution
function escapeSqlValue(value: any): string {
  if (value === null || value === undefined) {
    return 'NULL';
  }
  if (typeof value === 'number') {
    return String(value);
  }
  if (typeof value === 'boolean') {
    return value ? 'true' : 'false';
  }
  if (value instanceof Date) {
    return `'${value.toISOString()}'`;
  }
  // String - escape single quotes
  return `'${String(value).replace(/'/g, "''")}'`;
}

// We need to patch the ACTUAL PreparedQuery class, not create a new one
// Since ES modules are immutable, we'll patch the prototype directly

// Patch the constructor by wrapping it
const OriginalConstructor = PreparedQuery;
const PatchedConstructor: any = function(this: any, queryIR: any) {
  // Call original constructor
  OriginalConstructor.call(this, queryIR);

  // If this query needs PGlite parameter inlining, patch THIS INSTANCE's run method
  if (queryIR?._rawSQL && queryIR?._pgliteParamsList) {
    const paramsList = queryIR._pgliteParamsList;

    this.run = async (params: any, dbConn: any) => {
      console.error(`>>>>>> ${MODULE_VERSION} INLINING SQL PARAMETERS <<<<<<`);

      let statement = queryIR.statement;

      // Replace $1, $2, etc. with escaped values
      for (let i = 0; i < paramsList.length; i++) {
        const paramName = paramsList[i];
        const value = params[paramName];
        const escapedValue = escapeSqlValue(value);

        statement = statement.replace(`$${i + 1}`, escapedValue);
      }

      console.error("Executing SQL:", statement.substring(0, 100) + "...");

      // Execute with empty bindings array since we've inlined everything
      const result = await dbConn.query(statement, []);
      return result.rows || [];
    };
  }
};

// Copy prototype
PatchedConstructor.prototype = OriginalConstructor.prototype;

// Try to replace global PreparedQuery if possible
try {
  (globalThis as any).PreparedQuery = PatchedConstructor;
  console.error("!!!!! Patched global PreparedQuery !!!!!");
} catch (e) {
  console.error("!!!!! Could not patch global PreparedQuery:", e);
}

console.error(`!!!!! PGLITE PATCH LOADED (${MODULE_VERSION}) !!!!!`);
