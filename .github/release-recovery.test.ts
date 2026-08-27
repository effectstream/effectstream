import { describe, expect, test } from "bun:test";
import { readFileSync } from "fs";
import { join } from "path";
import {
  classifyRecoveryMode,
  planRegistryCompletion,
  resolveReleasePolicy,
  validateRecoveryBranchState,
  type RegistryPackageState,
  type ReleaseManifest,
} from "./publish-bun.effectstream";

function fixture(tag: string): ReleaseManifest {
  const policy = resolveReleasePolicy(tag);
  const packages = Array.from({ length: 39 }, (_, index) => ({
    name: `@effectstream/recovery-${index}`,
    relativeDir: `packages/${index}`,
    filename: `${index}.tgz`,
    size: index,
    sha512: `hex-${index}`,
    integrity: `sha512-${index}`,
    versionBefore: policy.kind === "maintenance-stable" ? "0.104.1" : "0.200.2",
  }));
  return {
    schemaVersion: 1,
    releaseTag: policy.releaseTag,
    version: policy.version,
    sourceSha: "a".repeat(40),
    branch: policy.branch,
    distTag: policy.distTag,
    prerelease: policy.prerelease,
    kind: policy.kind,
    workflow: { runId: "11", runAttempt: "1" },
    toolchain: { bun: "1.4.0", platform: "linux-x64" },
    latestBefore: Object.fromEntries(packages.map((pkg) => [pkg.name, "0.200.2"])),
    packages,
  };
}

function registry(manifest: ReleaseManifest, partial: boolean): RegistryPackageState[] {
  return manifest.packages.map((pkg, index) => ({
    name: pkg.name,
    targetIntegrity: partial && index > 4 ? null : pkg.integrity,
    distTags: {
      latest: manifest.kind === "node2-stable" && !partial ? manifest.version : "0.200.2",
      [manifest.distTag]: manifest.version,
    },
  }));
}

describe("all release kinds and recovery states", () => {
  test.each(["v0.104.2", "v0.200.3", "v0.200.3-rc.1"])(
    "%s uses exact persisted occupancy in all four states",
    (tag) => {
      const manifest = fixture(tag);
      for (const partial of [true, false]) {
        for (const advanced of [false, true]) {
          const completion = planRegistryCompletion(manifest, registry(manifest, partial), true);
          expect(classifyRecoveryMode(completion.missing.length > 0, advanced)).toBe(
            `${partial ? "partial" : "complete"}-${advanced ? "advanced" : "tag"}`,
          );
          expect(completion.missing.length).toBe(partial ? 34 : 0);
          expect(completion.existing.length).toBe(partial ? 5 : 39);
        }
      }
    },
  );

  test.each(["v0.104.2", "v0.200.3", "v0.200.3-rc.1"])(
    "%s validates tag/advanced ancestry and unchanged versions",
    (tag) => {
      const manifest = fixture(tag);
      const versions = Array(40).fill(manifest.packages[0].versionBefore);
      expect(() => validateRecoveryBranchState(manifest, "partial-tag", manifest.sourceSha, true, versions)).not.toThrow();
      expect(() => validateRecoveryBranchState(manifest, "complete-tag", manifest.sourceSha, true, versions)).not.toThrow();
      expect(() => validateRecoveryBranchState(manifest, "partial-advanced", "b".repeat(40), true, versions)).not.toThrow();
      expect(() => validateRecoveryBranchState(manifest, "complete-advanced", "b".repeat(40), true, versions)).not.toThrow();
      expect(() => validateRecoveryBranchState(manifest, "partial-tag", "b".repeat(40), true, versions)).toThrow(/Tag-state/);
      expect(() => validateRecoveryBranchState(manifest, "partial-advanced", "b".repeat(40), false, versions)).toThrow(/does not descend/);
      expect(() => validateRecoveryBranchState(manifest, "complete-advanced", "b".repeat(40), true, [...versions.slice(0, 2), "9.9.9", ...versions.slice(3)])).toThrow(/Version drift/);
    },
  );
});

describe("recovery authorization and branch protections", () => {
  const workflow = readFileSync(
    join(import.meta.dir, "workflows", "release-recovery.yaml"),
    "utf8",
  );

  test("requires exact state, artifact, audit, authorization, and branch inputs", () => {
    for (const input of [
      "recovery_mode",
      "original_run_id",
      "artifact_id",
      "expected_service_digest",
      "manifest_sha512",
      "release_tag",
      "source_sha",
      "expected_current_branch_sha",
      "approval_refs",
    ]) {
      expect(workflow).toContain(`${input}:`);
    }
    expect(workflow).toContain("environment: npm-release-recovery");
    expect(workflow).toContain("git merge-base --is-ancestor");
    expect(workflow).toContain('git push origin "HEAD:refs/heads/$SOURCE_BRANCH"');
    expect(workflow).not.toContain("git push --force");
    expect(workflow).not.toContain("--force-with-lease");
  });

  test("read-only proof cannot fall through to recovery mutation", () => {
    expect(workflow).toContain("if: ${{ inputs.recovery_mode == 'artifact-proof' }}");
    expect(workflow).toContain("if: ${{ inputs.recovery_mode != 'artifact-proof' }}");
    const proof = workflow.slice(workflow.indexOf("  artifact-proof:"), workflow.indexOf("  recover:"));
    expect(proof).not.toContain("NPM_TOKEN");
    expect(proof).not.toContain("contents: write");
    expect(proof).not.toContain("environment:");
  });
});
