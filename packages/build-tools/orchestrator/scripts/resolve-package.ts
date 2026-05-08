import fs from "fs";
import path from "path";

export type ResolveLocation =
  | { cwd: string; resolveFrom?: never }
  | { resolveFrom: string; cwd?: never };

function resolveEntry(packageName: string, resolveFrom: string): string {
  try {
    return require.resolve(packageName, { paths: [resolveFrom] });
  } catch {
    return require.resolve(`${packageName}/package.json`, { paths: [resolveFrom] });
  }
}

function resolveViaRequire(
  launcherName: string,
  packageName: string,
  resolveFrom: string,
): string {
  const resolved = resolveEntry(packageName, resolveFrom);
  let dir = path.dirname(resolved);
  while (dir !== path.dirname(dir)) {
    const pkgJsonPath = path.join(dir, "package.json");
    if (!fs.existsSync(pkgJsonPath)) { dir = path.dirname(dir); continue; }
    const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, "utf8"));
    if (pkg.name === packageName) return dir;
    dir = path.dirname(dir);
  }
  throw new Error(
    `${launcherName}: could not find package.json for "${packageName}" (resolved to "${resolved}")`,
  );
}

function validatePackageName(
  launcherName: string,
  packageName: string,
  cwd: string,
): void {
  const pkgPath = path.join(cwd, "package.json");
  if (!fs.existsSync(pkgPath)) {
    throw new Error(`${launcherName}: no package.json found in "${cwd}"`);
  }
  const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
  if (pkg.name !== packageName) {
    throw new Error(
      `${launcherName}: expected package "${packageName}" but found "${pkg.name}" in "${cwd}"`,
    );
  }
}

export function resolvePackageDir(
  launcherName: string,
  packageName: string,
  location: ResolveLocation,
  requiredScripts: Record<string, string>,
): string {
  const dir = location.cwd
    ? (validatePackageName(launcherName, packageName, location.cwd), location.cwd)
    : resolveViaRequire(launcherName, packageName, location.resolveFrom);

  const pkgPath = path.join(dir, "package.json");
  const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
  const scripts = pkg.scripts ?? {};
  const missing = Object.keys(requiredScripts).filter((s) => !(s in scripts));
  if (missing.length > 0) {
    throw new Error(
      `${launcherName}: package "${packageName}" is missing required scripts: ${missing.join(", ")}\n` +
        `  This launcher expects the following scripts in package.json:\n` +
        missing.map((s) => `    - ${s}: ${requiredScripts[s]}`).join("\n"),
    );
  }
  return dir;
}
