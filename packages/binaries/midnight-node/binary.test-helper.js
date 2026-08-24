const crypto = require("crypto");
const fs = require("fs");
const http = require("http");
const os = require("os");
const path = require("path");

const { describe, expect, test } = require("bun:test");

const CRC32_TABLE = Array.from({ length: 256 }, (_, value) => {
  let crc = value;
  for (let bit = 0; bit < 8; bit += 1) {
    crc = (crc & 1) ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
  }
  return crc >>> 0;
});

function crc32(data) {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc = CRC32_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function createZip(entries) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;

  for (const entry of entries) {
    const name = Buffer.from(entry.name);
    const data = Buffer.isBuffer(entry.data)
      ? entry.data
      : Buffer.from(entry.data || "");
    const checksum = crc32(data);
    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt32LE(checksum, 14);
    localHeader.writeUInt32LE(data.length, 18);
    localHeader.writeUInt32LE(data.length, 22);
    localHeader.writeUInt16LE(name.length, 26);
    localParts.push(localHeader, name, data);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE((3 << 8) | 20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt32LE(checksum, 16);
    centralHeader.writeUInt32LE(data.length, 20);
    centralHeader.writeUInt32LE(data.length, 24);
    centralHeader.writeUInt16LE(name.length, 28);
    const unixMode = entry.type === "symlink" ? 0o120777 : 0o100644;
    centralHeader.writeUInt32LE((unixMode << 16) >>> 0, 38);
    centralHeader.writeUInt32LE(offset, 42);
    centralParts.push(centralHeader, name);

    offset += localHeader.length + name.length + data.length;
  }

  const centralDirectory = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...localParts, centralDirectory, end]);
}

function sha256(data) {
  return crypto.createHash("sha256").update(data).digest("hex");
}

async function serveArchive(archive) {
  let requests = 0;
  const server = http.createServer((request, response) => {
    requests += 1;
    if (request.url === "/missing.zip") {
      response.writeHead(404);
      response.end("missing");
      return;
    }
    response.writeHead(200, {
      "content-length": archive.length,
      "content-type": "application/zip",
    });
    response.end(archive);
  });
  let listening = false;
  for (let attempt = 0; attempt < 100 && !listening; attempt += 1) {
    const port = 10001 + Math.floor(Math.random() * 50000);
    const error = await new Promise((resolve) => {
      const onError = (cause) => {
        server.off("listening", onListening);
        resolve(cause);
      };
      const onListening = () => {
        server.off("error", onError);
        resolve(null);
      };
      server.once("error", onError);
      server.once("listening", onListening);
      server.listen(port, "127.0.0.1");
    });
    if (!error) listening = true;
    else if (error.code !== "EADDRINUSE") throw error;
  }
  if (!listening) throw new Error("Could not allocate a random test port above 10000");
  const address = server.address();
  return {
    get requests() {
      return requests;
    },
    url: `http://127.0.0.1:${address.port}`,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

function fixtureEntries(asset, executableName = asset.executableName) {
  const entries = [
    {
      name: executableName,
      data: "#!/bin/sh\necho wrapper-fixture\n",
    },
  ];
  for (const directory of asset.requiredDirectories || []) {
    entries.push({
      name: `${directory}/fixture.txt`,
      data: "required runtime resource\n",
    });
    entries.push({
      name: `${directory}/config/version.txt`,
      data: "fixture-version-1\n",
    });
    entries.push({
      name: `${directory}/current-config`,
      data: "config/version.txt",
      type: "symlink",
    });
  }
  return entries;
}

function makeBaseDir(label) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `${label}-wrapper-test-`));
}

function defineWrapperContractTests(wrapper, expectations) {
  describe(`${expectations.label} binary wrapper`, () => {
    test("resolves only the two exact published assets", () => {
      expect(wrapper.getPlatform("darwin", "arm64")).toBe("macos-arm64");
      expect(wrapper.getPlatform("linux", "x64")).toBe("linux-amd64");
      expect(wrapper.ASSETS).toEqual(expectations.assets);
      expect(wrapper.getBinaryUrl("macos-arm64")).toBe(
        expectations.assets["macos-arm64"].url,
      );
      expect(wrapper.getBinaryUrl("linux-amd64")).toBe(
        expectations.assets["linux-amd64"].url,
      );
      expect(() => wrapper.getAsset("linux-arm64")).toThrow(
        /Unsupported platform/,
      );
    });

    test("downloads, verifies, extracts exactly, sets executable mode, and reuses a clean cache", async () => {
      const baseDir = makeBaseDir(expectations.label);
      const publishedAsset = wrapper.ASSETS["macos-arm64"];
      const archive = createZip(fixtureEntries(publishedAsset));
      const server = await serveArchive(archive);
      const asset = {
        ...publishedAsset,
        sha256: sha256(archive),
        url: `${server.url}/${publishedAsset.archiveName}`,
      };

      try {
        const first = await wrapper.binary({ asset, baseDir });
        expect(first.downloaded).toBe(true);
        expect(server.requests).toBe(1);
        expect(fs.readFileSync(first.binaryPath, "utf8")).toContain(
          "wrapper-fixture",
        );
        expect(fs.statSync(first.binaryPath).mode & 0o111).not.toBe(0);
        expect(wrapper.isBinaryCacheValid({ asset, baseDir })).toBe(true);
        expect(fs.existsSync(wrapper.getPaths(baseDir, asset).archivePath)).toBe(
          false,
        );

        const second = await wrapper.binary({ asset, baseDir });
        expect(second.downloaded).toBe(false);
        expect(server.requests).toBe(1);

        fs.appendFileSync(first.binaryPath, "tampered");
        expect(wrapper.isBinaryCacheValid({ asset, baseDir })).toBe(false);
        const repaired = await wrapper.binary({ asset, baseDir });
        expect(repaired.downloaded).toBe(true);
        expect(server.requests).toBe(2);
        expect(wrapper.isBinaryCacheValid({ asset, baseDir })).toBe(true);

        if (expectations.preservedCacheFile) {
          const preserved = path.join(
            wrapper.getPaths(baseDir, asset).cacheDir,
            expectations.preservedCacheFile,
          );
          fs.writeFileSync(preserved, "preserve me\n");
          await wrapper.cleanBinaries({ baseDir });
          expect(fs.existsSync(preserved)).toBe(true);
        } else {
          await wrapper.cleanBinaries({ baseDir });
        }
        expect(fs.existsSync(repaired.binaryPath)).toBe(false);
        expect(wrapper.isBinaryCacheValid({ asset, baseDir })).toBe(false);
      } finally {
        await server.close();
        fs.rmSync(baseDir, { force: true, recursive: true });
      }
    });

    test("fails closed on a corrupt archive and removes download residue", async () => {
      const baseDir = makeBaseDir(expectations.label);
      const publishedAsset = wrapper.ASSETS["macos-arm64"];
      const archive = createZip(fixtureEntries(publishedAsset));
      const server = await serveArchive(archive);
      const asset = {
        ...publishedAsset,
        sha256: "0".repeat(64),
        url: `${server.url}/${publishedAsset.archiveName}`,
      };
      try {
        await expect(wrapper.binary({ asset, baseDir })).rejects.toThrow(
          /SHA-256 mismatch.*Refusing to extract or run/s,
        );
        const paths = wrapper.getPaths(baseDir, asset);
        expect(fs.existsSync(paths.archivePath)).toBe(false);
        expect(fs.existsSync(paths.binaryPath)).toBe(false);
      } finally {
        await server.close();
        fs.rmSync(baseDir, { force: true, recursive: true });
      }
    });

    test("fails clearly when the published asset is missing", async () => {
      const baseDir = makeBaseDir(expectations.label);
      const publishedAsset = wrapper.ASSETS["macos-arm64"];
      const archive = createZip(fixtureEntries(publishedAsset));
      const server = await serveArchive(archive);
      const asset = {
        ...publishedAsset,
        sha256: sha256(archive),
        url: `${server.url}/missing.zip`,
      };
      try {
        await expect(wrapper.binary({ asset, baseDir })).rejects.toThrow(
          /failed to download.*HTTP 404/s,
        );
        expect(fs.existsSync(wrapper.getPaths(baseDir, asset).binaryPath)).toBe(
          false,
        );
      } finally {
        await server.close();
        fs.rmSync(baseDir, { force: true, recursive: true });
      }
    });

    test("rejects a checksum-valid archive with the wrong executable name", async () => {
      const baseDir = makeBaseDir(expectations.label);
      const publishedAsset = wrapper.ASSETS["macos-arm64"];
      const archive = createZip(
        fixtureEntries(publishedAsset, `${publishedAsset.executableName}.wrong`),
      );
      const server = await serveArchive(archive);
      const asset = {
        ...publishedAsset,
        sha256: sha256(archive),
        url: `${server.url}/${publishedAsset.archiveName}`,
      };
      try {
        await expect(wrapper.binary({ asset, baseDir })).rejects.toThrow(
          /expected extracted executable missing/,
        );
        expect(fs.existsSync(wrapper.getPaths(baseDir, asset).binaryPath)).toBe(
          false,
        );
      } finally {
        await server.close();
        fs.rmSync(baseDir, { force: true, recursive: true });
      }
    });

    if (wrapper.ASSETS["macos-arm64"].requiredDirectories?.length) {
      test("rejects an archive missing required runtime resources", async () => {
        const baseDir = makeBaseDir(expectations.label);
        const publishedAsset = wrapper.ASSETS["macos-arm64"];
        const archive = createZip([
          {
            name: publishedAsset.executableName,
            data: "#!/bin/sh\necho missing-res\n",
          },
        ]);
        const server = await serveArchive(archive);
        const asset = {
          ...publishedAsset,
          sha256: sha256(archive),
          url: `${server.url}/${publishedAsset.archiveName}`,
        };
        try {
          await expect(wrapper.binary({ asset, baseDir })).rejects.toThrow(
            /required archive directory missing/,
          );
        } finally {
          await server.close();
          fs.rmSync(baseDir, { force: true, recursive: true });
        }
      });
    }

    if (expectations.verifyResourceManifest) {
      test("binds the complete runtime-resource manifest and clean-redownloads every mismatch", async () => {
        const baseDir = makeBaseDir(expectations.label);
        const publishedAsset = wrapper.ASSETS["macos-arm64"];
        const archive = createZip(fixtureEntries(publishedAsset));
        const server = await serveArchive(archive);
        const asset = {
          ...publishedAsset,
          sha256: sha256(archive),
          url: `${server.url}/${publishedAsset.archiveName}`,
        };
        const paths = wrapper.getPaths(baseDir, asset);
        const resDir = path.join(paths.cacheDir, "res");
        const fixtureFile = path.join(resDir, "fixture.txt");
        const symlinkPath = path.join(resDir, "current-config");

        const repair = async (expectedRequests) => {
          expect(wrapper.isBinaryCacheValid({ asset, baseDir })).toBe(false);
          const result = await wrapper.binary({ asset, baseDir });
          expect(result.downloaded).toBe(true);
          expect(server.requests).toBe(expectedRequests);
          expect(wrapper.isBinaryCacheValid({ asset, baseDir })).toBe(true);
        };

        try {
          await wrapper.binary({ asset, baseDir });
          expect(server.requests).toBe(1);
          expect(wrapper.isBinaryCacheValid({ asset, baseDir })).toBe(true);
          const cleanMetadata = JSON.parse(
            fs.readFileSync(paths.metadataPath, "utf8"),
          );
          expect(cleanMetadata.resourceManifestVersion).toBe(
            wrapper.RESOURCE_MANIFEST_VERSION,
          );
          expect(cleanMetadata.resourceManifestSha256).toHaveLength(64);
          expect(cleanMetadata.resourceManifest).toContainEqual(
            expect.objectContaining({
              path: "res/current-config",
              type: "symlink",
              target: "config/version.txt",
            }),
          );

          fs.appendFileSync(fixtureFile, "mutated\n");
          await repair(2);

          fs.rmSync(resDir, { recursive: true, force: true });
          await repair(3);

          fs.rmSync(resDir, { recursive: true, force: true });
          fs.mkdirSync(resDir);
          await repair(4);

          const crossVersionPath = path.join(resDir, "chain-v8", "genesis.json");
          fs.mkdirSync(path.dirname(crossVersionPath), { recursive: true });
          fs.writeFileSync(crossVersionPath, '{"version":8}\n');
          await repair(5);
          expect(fs.existsSync(crossVersionPath)).toBe(false);

          fs.rmSync(fixtureFile);
          fs.mkdirSync(fixtureFile);
          await repair(6);

          fs.chmodSync(fixtureFile, 0o600);
          await repair(7);

          fs.rmSync(symlinkPath);
          fs.symlinkSync("fixture.txt", symlinkPath);
          await repair(8);
          expect(fs.readlinkSync(symlinkPath)).toBe("config/version.txt");

          const oldMetadata = JSON.parse(
            fs.readFileSync(paths.metadataPath, "utf8"),
          );
          delete oldMetadata.resourceManifestVersion;
          delete oldMetadata.resourceManifestSha256;
          delete oldMetadata.resourceManifest;
          fs.writeFileSync(
            paths.metadataPath,
            `${JSON.stringify(oldMetadata, null, 2)}\n`,
          );
          await repair(9);
        } finally {
          await server.close();
          fs.rmSync(baseDir, { force: true, recursive: true });
        }
      });
    }
  });
}

module.exports = { defineWrapperContractTests };
