// Remappings for hardhat / forge are not compatible.
// So we need to create them depending on the tool we are using.
import { parseArgs } from "@std/cli/parse-args";

// The depth is the number of directories where the node_modules are located.
const flags = parseArgs(Deno.args, {
  string: ["package"],
  default: { package: '@paima' },
});

const packageName = flags.package;

import * as remappings from "./assets.ts";
const hardhatRemappings = new TextDecoder().decode(remappings.default.files["remappings.hardhat"].content)
  .replace(/@paima/g, packageName);

Deno.writeTextFileSync("./remappings.txt", hardhatRemappings);