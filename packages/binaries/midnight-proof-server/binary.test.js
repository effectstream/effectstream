const { defineWrapperContractTests } = require("../midnight-node/binary.test-helper");
const wrapper = require("./binary");

defineWrapperContractTests(wrapper, {
  label: "midnight-proof-server",
  assets: {
    "macos-arm64": {
      platform: "macos-arm64",
      version: "9.0.0-rc.5",
      archiveName: "midnight-proof-server-macos-arm64-9.0.0-rc.5.zip",
      executableName: "midnight-proof-server-macos-arm64-9.0.0-rc.5",
      sha256: "2149ba808892122cfab9ace2e382f4addecc2ecbe06b17dcd1bffece5a5be891",
      url: "https://github.com/effectstream/binaries/releases/download/0.3.120/midnight-proof-server-macos-arm64-9.0.0-rc.5.zip",
    },
    "linux-amd64": {
      platform: "linux-amd64",
      version: "9.0.0-rc.5",
      archiveName: "midnight-proof-server-linux-amd64-9.0.0-rc.5.zip",
      executableName: "midnight-proof-server-linux-amd64-9.0.0-rc.5",
      sha256: "a0db7b0613a86618d672c6aa6064519fb95aba6f9352cfbb351fed885d622124",
      url: "https://github.com/effectstream/binaries/releases/download/0.3.120/midnight-proof-server-linux-amd64-9.0.0-rc.5.zip",
    },
  },
});
