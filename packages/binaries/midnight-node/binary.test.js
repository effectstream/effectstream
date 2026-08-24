const { defineWrapperContractTests } = require("./binary.test-helper");
const wrapper = require("./binary");

defineWrapperContractTests(wrapper, {
  label: "midnight-node",
  assets: {
    "macos-arm64": {
      platform: "macos-arm64",
      version: "2.0.0-rc.4",
      archiveName: "midnight-node-macos-arm64-2.0.0-rc.4.zip",
      executableName: "midnight-node-macos-arm64-2.0.0-rc.4",
      sha256: "4ee77c1043dec716f7a1b133f0ebb8f23bbc3a704f348ae5708a6b58b330ed8c",
      url: "https://github.com/effectstream/binaries/releases/download/0.3.120/midnight-node-macos-arm64-2.0.0-rc.4.zip",
      requiredDirectories: ["res"],
    },
    "linux-amd64": {
      platform: "linux-amd64",
      version: "2.0.0-rc.4",
      archiveName: "midnight-node-linux-amd64-2.0.0-rc.4.zip",
      executableName: "midnight-node-linux-amd64-2.0.0-rc.4",
      sha256: "8f53e9dfb2c70ec2fb98fd6958466ef107685774ca4d93660bc63e7686948879",
      url: "https://github.com/effectstream/binaries/releases/download/0.3.120/midnight-node-linux-amd64-2.0.0-rc.4.zip",
      requiredDirectories: ["res"],
    },
  },
});
