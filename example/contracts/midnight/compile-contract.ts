#!/usr/bin/env -S deno run -A

import {
  dirname,
  join,
  resolve,
} from "https://deno.land/std@0.224.0/path/mod.ts";
import { existsSync } from "https://deno.land/std@0.224.0/fs/mod.ts";

// Get the directory where this script is located
const __dirname = dirname(new URL(import.meta.url).pathname);

// Platform detection
function getCurrentPlatform(): string {
  const os = Deno.build.os;
  const arch = Deno.build.arch;

  if (os === "darwin") {
    if (arch === "aarch64") {
      return "aarch64-darwin";
    } else if (arch === "x86_64") {
      return "x86_64-apple-darwin";
    }
  } else if (os === "linux" && arch === "x86_64") {
    return "x86_64-unknown-linux-musl";
  }

  throw new Error(`Unsupported platform: ${os} ${arch}`);
}

// Download and extract compactc binary
async function downloadAndExtractCompactc(platform: string): Promise<void> {
  const baseUrl =
    "https://d3fazakqrumx6p.cloudfront.net/artifacts/compiler/compactc_0.24.0";
  const zipFileName = `compactc_v0.24.0_${platform}.zip`;
  const downloadUrl = `${baseUrl}/${zipFileName}`;

  console.log(`Downloading compactc for platform: ${platform}`);
  console.log(`URL: ${downloadUrl}`);

  try {
    const response = await fetch(downloadUrl);
    if (!response.ok) {
      throw new Error(
        `Failed to download: ${response.status} ${response.statusText}`,
      );
    }

    const zipData = await response.arrayBuffer();
    const zipPath = join(__dirname, zipFileName);

    // Write zip file
    await Deno.writeFile(zipPath, new Uint8Array(zipData));

    // Extract zip file
    const compactcDir = join(__dirname, "compactc");
    await Deno.mkdir(compactcDir, { recursive: true });

    // Use system unzip command
    const unzipCommand = new Deno.Command("unzip", {
      args: ["-o", zipPath, "-d", compactcDir],
      cwd: __dirname,
    });

    const unzipResult = await unzipCommand.output();
    if (!unzipResult.success) {
      throw new Error(
        `Failed to extract zip file: ${
          new TextDecoder().decode(unzipResult.stderr)
        }`,
      );
    }

    // Clean up zip file
    await Deno.remove(zipPath);

    // Make compactc executable
    const compactcPath = join(compactcDir, "compactc");
    if (existsSync(compactcPath)) {
      await Deno.chmod(compactcPath, 0o755);
    }

    console.log("Successfully downloaded and extracted compactc");
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Failed to download and extract compactc: ${errorMessage}`,
    );
  }
}

// Check if required files exist in compactc folder
function checkRequiredFiles(): boolean {
  const compactcDir = join(__dirname, "compactc");
  const requiredFiles = ["compactc", "compactc.bin", "zkir"];

  if (!existsSync(compactcDir)) {
    return false;
  }

  for (const file of requiredFiles) {
    const filePath = join(compactcDir, file);
    if (!existsSync(filePath)) {
      console.log(`Missing required file: ${file}`);
      return false;
    }
  }

  return true;
}

// Run compactc compilation
async function runCompilation(): Promise<void> {
  const compactcPath = resolve(__dirname, "compactc", "compactc");
  const inputPath = resolve(__dirname, "contract", "src", "counter.compact");
  const outputPath = resolve(
    __dirname,
    "contract",
    "src",
    "managed",
    "counter",
  );

  console.log("Running compactc compilation...");
  console.log(`Command: ${compactcPath} ${inputPath} ${outputPath}`);

  // Ensure managed directory exists (contract/src/managed)
  const managedDir = resolve(__dirname, "contract", "src", "managed");
  await Deno.mkdir(managedDir, { recursive: true });

  // Ensure output directory exists
  const outputDir = dirname(outputPath);
  await Deno.mkdir(outputDir, { recursive: true });

  const command = new Deno.Command(compactcPath, {
    args: [inputPath, outputPath],
    cwd: __dirname,
  });

  const result = await command.output();

  if (!result.success) {
    const errorOutput = new TextDecoder().decode(result.stderr);
    throw new Error(`Compilation failed: ${errorOutput}`);
  }

  const output = new TextDecoder().decode(result.stdout);
  if (output) {
    console.log(output);
  }

  console.log("Compilation completed successfully!");
}

// Main execution
async function main(): Promise<void> {
  try {
    console.log("Starting compactc compilation process...");

    // Check if compactc folder and required files exist
    if (!checkRequiredFiles()) {
      console.log(
        "compactc folder or required files not found. Downloading...",
      );
      const platform = getCurrentPlatform();
      await downloadAndExtractCompactc(platform);

      // Check again after download
      if (!checkRequiredFiles()) {
        throw new Error(
          "Failed to set up compactc - required files still missing after download",
        );
      }
    } else {
      console.log(
        "compactc folder and required files found. Proceeding with compilation...",
      );
    }

    // Run compilation
    await runCompilation();
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("Error:", errorMessage);
    Deno.exit(1);
  }
}

// Run main function
if (import.meta.main) {
  await main();
}
