const esbuild = require("esbuild");
const {
  config,
} = require("@paima/build-utils/middleware-esbuildconfig.template");
esbuild.build(config);
