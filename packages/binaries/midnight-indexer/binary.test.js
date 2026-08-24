const { defineWrapperContractTests } = require("../midnight-node/binary.test-helper");
const wrapper = require("./binary");

defineWrapperContractTests(wrapper, {
  label: "midnight-indexer",
  preservedCacheFile: "config.yaml",
  assets: {
    "macos-arm64": {
      platform: "macos-arm64",
      version: "4.4.0-rc.1",
      archiveName: "indexer-standalone-macos-arm64-v4.4.0-rc.1.zip",
      executableName: "indexer-standalone-macos-arm64-v4.4.0-rc.1",
      sha256: "39a3715f709a6c5b215802a1c7a290937cc19772cbb8f5a994330b3c4b987309",
      url: "https://github.com/effectstream/binaries/releases/download/0.3.120/indexer-standalone-macos-arm64-v4.4.0-rc.1.zip",
    },
    "linux-amd64": {
      platform: "linux-amd64",
      version: "4.4.0-rc.1",
      archiveName: "indexer-standalone-linux-amd64-v4.4.0-rc.1.zip",
      executableName: "indexer-standalone-linux-amd64-v4.4.0-rc.1",
      sha256: "eae945b7381af69cd42c4d480f7be14117d6e24524816aa58db2b8bfd7aee3b4",
      url: "https://github.com/effectstream/binaries/releases/download/0.3.120/indexer-standalone-linux-amd64-v4.4.0-rc.1.zip",
    },
  },
});
