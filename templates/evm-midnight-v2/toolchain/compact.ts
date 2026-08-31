import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

type CompactTarget =
  | "aarch64-darwin"
  | "x86_64-darwin"
  | "aarch64-unknown-linux-musl"
  | "x86_64-unknown-linux-musl";

type CompactToolchain = {
  compact: {
    version: string;
    releaseBaseUrl: string;
    targets: Record<CompactTarget, {
      asset: string;
      sha256: string;
    }>;
  };
};

export type CompactInvocation = {
  status: number | null;
  stdout?: string;
  stderr?: string;
  error?: NodeJS.ErrnoException;
};

export type CompactRunner = (args: string[]) => CompactInvocation;

const declarationPath = resolve(import.meta.dir, "../toolchain.json");
const declaration = JSON.parse(
  readFileSync(declarationPath, "utf8"),
) as CompactToolchain;

export const compactVersion = declaration.compact.version;
export const compactSelection = `+${compactVersion}`;

const installationHint = [
  "Install the Compact launcher:",
  "  curl --proto '=https' --tlsv1.2 -LsSf https://github.com/midnightntwrk/compact/releases/latest/download/compact-installer.sh | sh",
  `Then, from the template root, install selection ${compactVersion}:`,
  "  bun toolchain/compact.ts install",
].join("\n");

const defaultRunner: CompactRunner = (args) => {
  const result = spawnSync("compact", args, {
    encoding: "utf8",
    env: process.env,
  });
  return {
    status: result.status,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    error: result.error,
  };
};

export function validateCompactSelection(
  run: CompactRunner = defaultRunner,
): string {
  const launcher = run(["--version"]);
  if (launcher.error?.code === "ENOENT") {
    throw new Error(
      `Compact launcher was not found on PATH.\n${installationHint}`,
    );
  }
  if (launcher.error || launcher.status !== 0) {
    const detail = launcher.error?.message || launcher.stderr?.trim() || "unknown error";
    throw new Error(
      `Compact launcher could not run (${detail}).\n${installationHint}`,
    );
  }

  const compiler = run(["compile", compactSelection, "--version"]);
  if (compiler.error || compiler.status !== 0) {
    const detail = compiler.error?.message || compiler.stderr?.trim() || "selection is not installed";
    throw new Error(
      `Compact is installed, but template selection ${compactVersion} is unavailable (${detail}).\n` +
      "Install it from the template root with: bun toolchain/compact.ts install",
    );
  }

  const reportedVersion = compiler.stdout?.trim();
  if (!reportedVersion) {
    throw new Error(
      `Compact selection ${compactVersion} ran but did not report a compiler version. ` +
      "Reinstall it from the template root with: bun toolchain/compact.ts install",
    );
  }

  return reportedVersion;
}

export function resolveCompactTarget(
  platform: NodeJS.Platform = process.platform,
  architecture: string = process.arch,
): CompactTarget {
  if (platform === "darwin" && architecture === "arm64") return "aarch64-darwin";
  if (platform === "darwin" && architecture === "x64") return "x86_64-darwin";
  if (platform === "linux" && architecture === "arm64") return "aarch64-unknown-linux-musl";
  if (platform === "linux" && architecture === "x64") return "x86_64-unknown-linux-musl";
  throw new Error(
    `Compact selection ${compactVersion} has no pinned asset for ${platform}/${architecture}.`,
  );
}

export async function installCompactSelection(): Promise<string> {
  const launcher = defaultRunner(["--version"]);
  if (launcher.error?.code === "ENOENT") {
    throw new Error(`Compact launcher was not found on PATH.\n${installationHint}`);
  }
  if (launcher.error || launcher.status !== 0) {
    const detail = launcher.error?.message || launcher.stderr?.trim() || "unknown error";
    throw new Error(`Compact launcher could not run (${detail}).\n${installationHint}`);
  }

  const existing = defaultRunner(["compile", compactSelection, "--version"]);
  if (!existing.error && existing.status === 0 && existing.stdout?.trim()) {
    return existing.stdout.trim();
  }

  const target = resolveCompactTarget();
  const asset = declaration.compact.targets[target];
  const compactDirectory = process.env.COMPACT_DIRECTORY || join(homedir(), ".compact");
  const destination = join(
    compactDirectory,
    "versions",
    compactVersion,
    target,
  );
  if (existsSync(destination)) {
    throw new Error(
      `Compact selection directory exists but is unusable: ${destination}. ` +
      "Inspect or remove that exact directory, then rerun the installer.",
    );
  }

  const temporaryRoot = mkdtempSync(join(tmpdir(), "evm-midnight-compact-"));
  const archivePath = join(temporaryRoot, asset.asset);
  const extractionPath = join(temporaryRoot, "selection");
  try {
    const url = `${declaration.compact.releaseBaseUrl}/${asset.asset}`;
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to download ${url}: HTTP ${response.status}`);
    }
    const bytes = new Uint8Array(await response.arrayBuffer());
    const digest = createHash("sha256").update(bytes).digest("hex");
    if (digest !== asset.sha256) {
      throw new Error(
        `Checksum mismatch for ${asset.asset}: expected ${asset.sha256}, received ${digest}`,
      );
    }
    writeFileSync(archivePath, bytes);
    mkdirSync(extractionPath);
    const unzip = spawnSync("unzip", ["-q", archivePath, "-d", extractionPath], {
      encoding: "utf8",
    });
    const unzipError = unzip.error as NodeJS.ErrnoException | undefined;
    if (unzipError?.code === "ENOENT") {
      throw new Error("The `unzip` executable is required to install the pinned Compact selection.");
    }
    if (unzipError || unzip.status !== 0) {
      throw new Error(
        `Failed to extract ${asset.asset}: ${unzipError?.message || unzip.stderr?.trim() || "unknown error"}`,
      );
    }

    for (const executable of [
      "compactc",
      "compactc.bin",
      "fixup-compact",
      "format-compact",
      "zkir",
      "zkir-v3",
    ]) {
      const executablePath = join(extractionPath, executable);
      if (!existsSync(executablePath)) {
        throw new Error(`Pinned Compact asset is missing ${executable}.`);
      }
      chmodSync(executablePath, 0o755);
    }

    mkdirSync(dirname(destination), { recursive: true });
    renameSync(extractionPath, destination);
  } finally {
    rmSync(temporaryRoot, { recursive: true, force: true });
  }

  return validateCompactSelection();
}

function compile(args: string[]): never {
  validateCompactSelection();
  const result = spawnSync(
    "compact",
    ["compile", compactSelection, ...args],
    { stdio: "inherit", env: process.env },
  );
  if (result.error) throw result.error;
  process.exit(result.status ?? 1);
}

function check(): void {
  const reportedVersion = validateCompactSelection();
  console.log(
    `Compact template selection ${compactVersion} is ready (compiler reports ${reportedVersion}).`,
  );
}

if (import.meta.main) {
  const [command, ...args] = process.argv.slice(2);
  try {
    if (command === "check") {
      check();
    } else if (command === "install") {
      const reportedVersion = await installCompactSelection();
      console.log(
        `Installed Compact template selection ${compactVersion} (compiler reports ${reportedVersion}).`,
      );
    } else if (command === "compile") {
      compile(args);
    } else {
      throw new Error(
        "Usage: bun toolchain/compact.ts <install|check|compile> [compiler arguments]",
      );
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}
