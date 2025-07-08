// This script patches the foundry.toml file to use the correct path for the node_modules directory.
// Replace '/=../../../node_modules' for the correct path.

import path from "node:path";
const foundryToml = await Deno.readTextFile("foundry.toml");

const here = Deno.cwd();
let searchPath = here;
let nodeModulesPath = "";
let relativePath = "";
while (true) {
  try {
    Deno.statSync(searchPath);
  } catch {
    console.log(
      "node_modules not found. Make sure you have run `deno install` first.   ",
    );
    Deno.exit(1);
  }
  try {
    nodeModulesPath = path.join(searchPath, "node_modules");
    Deno.statSync(nodeModulesPath);
    console.log(`Found node_modules in ${nodeModulesPath}`);
    relativePath = path.relative(here, nodeModulesPath);
    break;
  } catch (e) {
    searchPath = path.join(searchPath, "..");
  }
}

if (relativePath) {
  await Deno.writeTextFile(
    "foundry.toml",
    foundryToml.replaceAll(
      "../../../../node_modules",
      `${relativePath}`,
    ),
  );
  console.log(
    `Patched foundry.toml with node_modules path=${relativePath}`,
  );
}
