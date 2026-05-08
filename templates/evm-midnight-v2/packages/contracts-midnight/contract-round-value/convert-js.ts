import { readFile, writeFile } from "node:fs/promises";

export async function convertJS(jsPath: string, tsPath: string) {
  const jsFile = await readFile(jsPath, "utf-8");
  const output = jsFile
    .replace(/^["']use strict["'];?/, "")
    .replace(
      /(const|let|var) (\w+) = require\(['"](.*)["']\);?/g,
      "import * as $2 from '$3';",
    )
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
