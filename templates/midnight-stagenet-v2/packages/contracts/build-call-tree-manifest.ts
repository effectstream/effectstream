import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dir, 'managed');
const definitions = [
  {
    name: 'CryptoEventSink',
    interfaceName: 'CryptoEventSink',
    circuit: 'hashStoreAndUnpause',
  },
  {
    name: 'FeatureGateway',
    interfaceName: null,
    circuit: 'run',
  },
] as const;

const contracts = Object.fromEntries(
  definitions.map(({ name, interfaceName, circuit }) => {
    const artifactPath = `managed/${name}`;
    const bundle = join(root, name);
    const compilerManifestPath = 'compiler/contract-manifest.json';
    const contractInfoPath = 'compiler/contract-info.json';
    const zkirPath = `zkir/${circuit}.zkir`;
    const verifierKeyPath = `keys/${circuit}.verifier`;
    const compilerManifest = JSON.parse(readFileSync(join(bundle, compilerManifestPath), 'utf8'));
    const contractInfo = JSON.parse(readFileSync(join(bundle, contractInfoPath), 'utf8'));
    const zkir = JSON.parse(readFileSync(join(bundle, zkirPath), 'utf8'));
    const verifierKey = readFileSync(join(bundle, verifierKeyPath));
    const verifierHeader = verifierKey.subarray(0, 64).toString('latin1');
    const keyVersion = Number(verifierHeader.match(/^midnight:verifier-key\[v(\d+)\]/)?.[1]);

    if (!Number.isInteger(keyVersion)) throw new Error(`Cannot determine ${name} verifier-key version`);
    if (zkir.do_communications_commitment !== true) {
      throw new Error(`${name}.${circuit} does not retain its communications commitment`);
    }
    if (contractInfo.circuits.length > 7) throw new Error(`${name} exports more than seven circuits`);

    return [
      name,
      {
        interfaceName,
        artifactPath,
        artifactTreeSha256: hashManifestTree(compilerManifest),
        compilerManifest: {
          path: `${artifactPath}/${compilerManifestPath}`,
          sha256: sha256(readFileSync(join(bundle, compilerManifestPath))),
        },
        contractInfo: {
          path: `${artifactPath}/${contractInfoPath}`,
          sha256: sha256(readFileSync(join(bundle, contractInfoPath))),
        },
        compiler: {
          version: compilerManifest['compiler-version'],
          languageVersion: compilerManifest['language-version'],
          runtimeVersion: compilerManifest['runtime-version'],
        },
        circuits: {
          [circuit]: {
            verifierKey: {
              path: `${artifactPath}/${verifierKeyPath}`,
              sha256: sha256(verifierKey),
            },
            zkir: {
              path: `${artifactPath}/${zkirPath}`,
              sha256: sha256(readFileSync(join(bundle, zkirPath))),
              version: `${zkir.version.major}.${zkir.version.minor}`,
              communicationsCommitment: true,
            },
            keyVersion,
          },
        },
      },
    ];
  }),
);

const manifest = {
  schemaVersion: 1,
  compilerRelease: '0.33.0-rc.1',
  compilationOrder: definitions.map(({ name }) => name),
  contracts,
};

writeFileSync(join(root, 'call-tree-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);

function hashManifestTree(manifest: any): string {
  const files: Array<{ path: string; size: number; hash: string }> = [];
  visit(manifest);
  return sha256(Buffer.from(`${files.sort((a, b) => a.path.localeCompare(b.path)).map((file) => `${file.path}\0${file.size}\0${file.hash}`).join('\n')}\n`));

  function visit(node: any, prefix = ''): void {
    for (const [name, entry] of Object.entries<any>(node)) {
      if (!entry || typeof entry !== 'object' || !('type' in entry)) continue;
      const path = prefix ? `${prefix}/${name}` : name;
      if (entry.type === 'directory') visit(entry, path);
      if (entry.type === 'file') files.push({ path, size: entry.size, hash: entry.hash });
    }
  }
}

function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}
