// Remappings for hardhat / forge are not compatible.
// So we need to create them depending on the tool we are using.
import { parseArgs } from "node:util";
import { writeFileSync } from "node:fs";
import { args } from "@effectstream/utils/runtime";

// The depth is the number of directories where the node_modules are located.
const { values: flags } = parseArgs({
  args: args(),
  options: {
    package: { type: "string", default: "@effectstream" },
  },
  strict: false,
});

const packageName = flags.package!;

import * as remappings from "./assets.ts";
const hardhatRemappings = new TextDecoder().decode(remappings.default.files["remappings.hardhat"].content)
  .replace(/@effectstream/g, packageName);

writeFileSync("./remappings.txt", hardhatRemappings);
