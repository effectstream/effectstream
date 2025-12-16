const esbuild = require("esbuild");
const {
  generateConfig,
} = require("@paima/build-utils/standalone-esbuildconfig.template");

const { config, outFiles, workspace } = generateConfig(
  "api",
  "state-transition",
);
esbuild.build(config);

console.log(
  `\x1b[32m${workspace}\x1b[0m bundled to packaged/${outFiles[workspace]}`,
);
