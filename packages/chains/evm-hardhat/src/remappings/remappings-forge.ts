import { parseArgs } from "@std/cli/parse-args";

// The depth is the number of directories where the node_modules are located.
const flags = parseArgs(Deno.args, {
  string: ['depth', "package"],
  default: { depth: '4', package: '@effectstream' },
});

const depth = parseInt(flags.depth, 10);
const packageName = flags.package;

if (isNaN(depth) || depth < 0) {
  console.error('Error: --depth must be a non-negative number.');
  Deno.exit(1);
}

const prefix = '../'.repeat(depth);

const remappings =
  [
    `@openzeppelin/=${prefix}node_modules/@openzeppelin/`,
    `${packageName}/=${prefix}node_modules/${packageName}/`,
  ].join('\n') + '\n';

Deno.writeTextFileSync("./remappings.txt", remappings);

console.log(`Wrote forge remappings to remappings.txt`);
