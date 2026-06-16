import { resolve, dirname } from "path";

/**
 * Walk the dependency tree rooted at `entryPkgPath` and decide what stays
 * external in the browser bundle.
 *
 * Rules:
 *  - Internal `@effectstream/*` *dependencies* are bundled (we recurse into them
 *    so the SDK ships self-contained), and their third-party deps are marked
 *    external.
 *  - Every `peerDependency` / `optionalDependency` is marked external — these are
 *    provided by the consumer at runtime, never bundled. This includes
 *    `@effectstream/*` peers. It is the critical rule: `@effectstream/wallets`
 *    declares `@effectstream/midnight-contracts` as an OPTIONAL peer dep and
 *    reaches it only via `import("@effectstream/midnight-contracts/wallet-info")`.
 *    That module is node-only (`node:util` `parseArgs`, `node:fs`); bundling it
 *    into a `target: "browser"` build fails with
 *    "Browser polyfill for module 'node:util' doesn't have a matching export
 *    named 'parseArgs'". Externalizing keeps the dynamic import as a runtime
 *    import the consumer's bundler resolves (or the source's `.catch()` handles
 *    when absent).
 */
export function collectExternals(entryPkgPath: string): Set<string> {
  const externalDeps = new Set<string>();
  const visited = new Set<string>();

  function walk(pkgPath: string) {
    if (visited.has(pkgPath)) return;
    visited.add(pkgPath);

    const pkg = require(pkgPath);

    // Peer + optional deps are never bundled — add the bare name AND a subpath
    // wildcard so subpath imports (e.g. `@effectstream/midnight-contracts/wallet-info`)
    // stay external too.
    for (const name of [
      ...Object.keys(pkg.peerDependencies ?? {}),
      ...Object.keys(pkg.optionalDependencies ?? {}),
    ]) {
      externalDeps.add(name);
      externalDeps.add(name + "/*");
    }

    for (const name of Object.keys(pkg.dependencies ?? {})) {
      if (!name.startsWith("@effectstream/")) {
        externalDeps.add(name);
      } else {
        try {
          const resolved = require.resolve(name + "/package.json", {
            paths: [dirname(pkgPath)],
          });
          walk(resolved);
        } catch {
          // workspace package not resolvable, skip
        }
      }
    }
  }

  walk(entryPkgPath);
  return externalDeps;
}

/** Build the browser bundle for `@effectstream/frontend-sdk`. */
export async function buildFrontend() {
  const externalDeps = collectExternals(resolve(import.meta.dir, "package.json"));

  const result = await Bun.build({
    entrypoints: [resolve(import.meta.dir, "src/mod.ts")],
    outdir: resolve(import.meta.dir, "dist"),
    target: "browser",
    format: "esm",
    external: [...externalDeps],
  });

  return { result, externalDeps };
}

// Only run the build when invoked as a script (`bun run build.ts`), not when
// imported by tests.
if (import.meta.main) {
  const { result, externalDeps } = await buildFrontend();

  if (!result.success) {
    console.error("Build failed:");
    for (const log of result.logs) {
      console.error(log);
    }
    process.exit(1);
  }

  console.log("Built frontend to dist/");
  console.log("External deps:", [...externalDeps].sort().join(", "));
}
