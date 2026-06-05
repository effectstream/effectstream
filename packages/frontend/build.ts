import { resolve, dirname } from "path";

const externalDeps = new Set<string>();
const visited = new Set<string>();

function collectExternals(pkgPath: string) {
  if (visited.has(pkgPath)) return;
  visited.add(pkgPath);

  const pkg = require(pkgPath);
  for (const name of Object.keys(pkg.dependencies ?? {})) {
    if (!name.startsWith("@effectstream/")) {
      externalDeps.add(name);
    } else {
      try {
        const resolved = require.resolve(name + "/package.json", {
          paths: [dirname(pkgPath)],
        });
        collectExternals(resolved);
      } catch {
        // workspace package not resolvable, skip
      }
    }
  }
  // Peer deps are never bundled — treat all of them as external.
  for (const name of Object.keys(pkg.peerDependencies ?? {})) {
    externalDeps.add(name);
  }
}

collectExternals(resolve(import.meta.dir, "package.json"));

const result = await Bun.build({
  entrypoints: ["./src/mod.ts"],
  outdir: "./dist",
  target: "browser",
  format: "esm",
  external: [...externalDeps],
});

if (!result.success) {
  console.error("Build failed:");
  for (const log of result.logs) {
    console.error(log);
  }
  process.exit(1);
}

console.log("Built frontend to dist/");
console.log("External deps:", [...externalDeps].sort().join(", "));
