#!/usr/bin/env node
const fs = require("fs");

const wrappers = [
  ["node", require("./binary")],
  ["indexer", require("../midnight-indexer/binary")],
  ["proof", require("../midnight-proof-server/binary")],
];

async function main() {
  const platform = wrappers[0][1].getPlatform();
  if (platform !== "linux-amd64") {
    throw new Error(`Linux download gate requires linux-amd64, got ${platform}`);
  }

  const evidence = { platform, assets: {} };
  for (const [, wrapper] of wrappers) await wrapper.cleanBinaries();
  for (const [name, wrapper] of wrappers) {
    const asset = wrapper.getAsset(platform);
    const first = await wrapper.binary({ platform });
    const paths = wrapper.getPaths(undefined, asset);
    if (!first.downloaded || !wrapper.isBinaryCacheValid({ asset })) {
      throw new Error(`${name} did not produce a valid clean-download cache`);
    }
    if ((fs.statSync(first.binaryPath).mode & 0o111) === 0) {
      throw new Error(`${name} extracted binary is not executable`);
    }
    if (fs.existsSync(paths.archivePath)) {
      throw new Error(`${name} archive was not removed after extraction`);
    }
    const second = await wrapper.binary({ platform });
    if (second.downloaded) {
      throw new Error(`${name} cache hit unexpectedly downloaded again`);
    }
    evidence.assets[name] = {
      archiveName: asset.archiveName,
      archiveSha256: asset.sha256,
      executableName: asset.executableName,
      targetVersion: asset.version,
      cacheValid: true,
      executable: true,
      secondCallDownloaded: second.downloaded,
    };
  }
  console.log(`M2B_LINUX_DOWNLOAD_GATE_PASS ${JSON.stringify(evidence)}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
