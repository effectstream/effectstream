// Convert js files to ts files.
//
// This is a temporal solution for converting the .cjs file to .ts
// This is a partial conversion and might fail for some cases.
// The goal is doing the minimal conversion to make it a valid ts file.
// We expect the compiler to generate the .mjs or .ts eventually.
import { readFile, writeFile } from "node:fs/promises";

export async function convertJS(jsPath: string, tsPath: string) {
  const jsFile = await readFile(jsPath, "utf-8");
  const output = jsFile
    // 1. Remove 'use strict'.
    .replace(/^["']use strict["'];?/, "")
    // 2. Replace const r = require('lib') with import * as r from 'lib'.
    .replace(
      /(const|let|var) (\w+) = require\(['"](.*)["']\);?/g,
      "import * as $2 from '$3';",
    )
    // replace exports.foo = foo; with export { foo };
    .replace(/exports\.(\w+) = (\w+);?/g, "export { $1 };");

  await writeFile(tsPath, output);
  console.log(`Converted ${jsPath} to ${tsPath}`);
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  if (args.length !== 2) {
    console.error(
      "Usage: bun run convert-js.ts <path-to-js-file> <path-to-ts-file>",
    );
    process.exit(1);
  }
  await convertJS(args[0], args[1]);
}
