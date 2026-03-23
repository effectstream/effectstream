// Remappings for hardhat / forge are not compatible.
// So we need to create them depending on the tool we are using.
import { parseArgs } from "@std/cli/parse-args";
import { writeFileSync } from "node:fs";
import { args } from "@effectstream/utils/runtime";
import * as remappings from "./assets.ts";

// The depth is the number of directories where the node_modules are located.
const flags = parseArgs(args(), {
  string: ["package"],
  default: { package: '@paima' },
});

const packageName = flags.package;

const hardhatRemappingsContent = new TextDecoder().decode(remappings.default.files["remappings.hardhat"].content);
const hardhatRemappings = hardhatRemappingsContent.replace(/@effectstream/g, packageName);

writeFileSync("./remappings.txt", hardhatRemappings);