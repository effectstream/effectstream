import fs from "fs";
import path from "path";

function resolveEntry(packageName: string, resolveFrom: string): string {
  try {
    return require.resolve(packageName, { paths: [resolveFrom] });
  } catch {
    return require.resolve(`${packageName}/package.json`, { paths: [resolveFrom] });
  }
}

export function resolvePackageDir(
  launcherName: string,
  packageName: string,
  resolveFrom: string,
  requiredScripts: Record<string, string>,
): string {
  const resolved = resolveEntry(packageName, resolveFrom);
  let dir = path.dirname(resolved);
  while (dir !== path.dirname(dir)) {
    const pkgJsonPath = path.join(dir, "package.json");
    if (!fs.existsSync(pkgJsonPath)) { dir = path.dirname(dir); continue; }

    const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, "utf8"));
    if (pkg.name !== packageName) { dir = path.dirname(dir); continue; }

    const scripts = pkg.scripts ?? {};
    const required = Object.keys(requiredScripts);
    const missing = required.filter((s) => !(s in scripts));
    if (missing.length > 0) {
      throw new Error(
        `${launcherName}: package "${packageName}" is missing required scripts: ${missing.join(", ")}\n` +
          `  This launcher expects the following scripts in package.json:\n` +
          missing.map((s) => `    - ${s}: ${requiredScripts[s]}`).join("\n"),
      );
    }
    return dir;
  }
  throw new Error(
    `${launcherName}: could not find package.json for "${packageName}" (resolved to "${resolved}")`,
  );
}
