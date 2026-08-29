import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "fs";
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
    documentReadable: true,
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
    join(import.meta.dir, "workflows", "release.yaml"),
    "utf8",
  );
  const recover = workflow.slice(workflow.indexOf("  recover:"));

  function step(name: string): string {
    const start = recover.indexOf(`      - name: ${name}`);
    expect(start).toBeGreaterThanOrEqual(0);
    const next = recover.indexOf("\n      - name:", start + 1);
    return recover.slice(start, next < 0 ? recover.length : next);
  }

  function runBodies(source: string): string[] {
    return [...source.matchAll(/\n\s+run:\s*\|\n((?:\s{10,}.*\n?)*)/g)].map((match) => match[1]);
  }

  test("single trusted caller retains all ten recovery/proof inputs and invariants", () => {
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
      "proof_digests",
    ]) {
      expect(workflow).toContain(`${input}:`);
    }
    expect(workflow).toContain("environment: npm-release-recovery");
    expect(workflow).toContain('merge-base --is-ancestor "$SOURCE_SHA" "$BRANCH_SHA"');
    expect(workflow).toContain('git push origin "HEAD:refs/heads/$SOURCE_BRANCH"');
    expect(workflow).not.toContain("git push --force");
    expect(workflow).not.toContain("--force-with-lease");
    const compatibility = workflow.indexOf("Validate recovery branch compatibility before authentication or mutation");
    const auth = workflow.indexOf("Setup exact Node and npm after recovery validation");
    const mutation = workflow.indexOf("Complete exact artifact publication and apply version delta");
    expect(compatibility).toBeGreaterThan(0);
    expect(compatibility).toBeLessThan(auth);
    expect(auth).toBeLessThan(mutation);
  });

  test("read-only proof cannot fall through to recovery mutation", () => {
    expect(workflow).toContain("github.event_name == 'workflow_dispatch' && inputs.recovery_mode == 'artifact-proof'");
    expect(workflow).toContain("github.event_name == 'workflow_dispatch' && inputs.recovery_mode != 'artifact-proof'");
    const proof = workflow.slice(workflow.indexOf("  artifact-proof:"), workflow.indexOf("  recover:"));
    expect(proof).not.toContain("id-token: write");
    expect(proof).not.toContain("contents: write");
    expect(proof).not.toContain("environment:");
    expect(proof).not.toContain("actions/checkout");
  });

  test("manual recovery fails closed unless dispatched from default-branch release.yaml", () => {
    const guard = workflow.indexOf("Require default-branch trusted caller identity");
    const download = workflow.indexOf("Download original immutable release bundle");
    const mutation = workflow.indexOf("Complete exact artifact publication and apply version delta");
    expect(guard).toBeGreaterThan(0);
    expect(guard).toBeLessThan(download);
    expect(download).toBeLessThan(mutation);
    expect(workflow).toContain('GITHUB_REF: ${{ github.ref }}');
    expect(workflow).toContain('DEFAULT_BRANCH: ${{ github.event.repository.default_branch }}');
    expect(workflow).toContain('GITHUB_WORKFLOW_REF: ${{ github.workflow_ref }}');
    expect(workflow).toContain('refs/heads/$DEFAULT_BRANCH');
    expect(workflow).toContain('.github/workflows/release.yaml@refs/heads/$DEFAULT_BRANCH');
  });

  test("trusted inline source proof precedes checkout and every repository executable", () => {
    const proof = recover.indexOf("Verify trusted recovery refs before checkout");
    const privilegedBoundary = [
      "Checkout exact trusted current branch head",
      "Setup Bun",
      "Install dependencies",
      "bun run .github/publish-bun.effectstream.ts --policy",
      "Setup exact Node and npm after recovery validation",
      "Download original immutable release bundle",
    ].map((needle) => recover.indexOf(needle));
    expect(proof).toBeGreaterThan(0);
    expect(privilegedBoundary.every((position) => position > proof)).toBe(true);

    const sourceProof = step("Verify trusted recovery refs before checkout");
    expect(sourceProof).toContain('RECOVERY_VERIFY_DIR: ${{ runner.temp }}/effectstream-recovery-source-proof');
    expect(sourceProof).toContain('[[ "$SOURCE_SHA" =~ ^[0-9a-f]{40}$ ]]');
    expect(sourceProof).toContain('[[ "$BRANCH_SHA" =~ ^[0-9a-f]{40}$ ]]');
    expect(sourceProof).toContain('refs/tags/$RELEASE_TAG');
    expect(sourceProof).toContain('refs/heads/$SOURCE_BRANCH');
    expect(sourceProof).toContain('merge-base --is-ancestor "$SOURCE_SHA" "$BRANCH_SHA"');
    expect(sourceProof).toContain('test "$remote_tag_commit" = "$SOURCE_SHA"');
    expect(sourceProof).toContain('test "$remote_branch_commit" = "$BRANCH_SHA"');

    const checkout = step("Checkout exact trusted current branch head");
    expect(checkout).toContain("persist-credentials: false");
    expect(checkout).not.toContain("token:");
    const policy = step("Compare checked-out policy with trusted source mapping");
    expect(policy).toContain('test "$branch" = "$TRUSTED_BRANCH"');
    expect(policy).toContain('test "$dist_tag" = "$TRUSTED_DIST_TAG"');
  });

  test("approval references are exactly two inert values and user inputs never enter run source", () => {
    const authorization = step("Require the complete audited mutation identity");
    expect(authorization).toContain('separators="${APPROVAL_REFS//[^|]/}"');
    expect(authorization).toContain('test "$separators" = \'|\'');
    expect(authorization.match(/\[\[ \"\$(?:audit_ref|authorization_ref)\" =~ \^\[A-Za-z0-9\]\[A-Za-z0-9\._:\/@\+-\]\{0,255\}\$ \]\]/g)).toHaveLength(2);
    expect(authorization).toContain("printf 'audit-ref=%s\\n' \"$audit_ref\"");
    expect(authorization).toContain("printf 'authorization-ref=%s\\n' \"$authorization_ref\"");

    const safeRef = /^[A-Za-z0-9][A-Za-z0-9._:/@+-]{0,255}$/;
    for (const value of [
      "'quoted'",
      '"quoted"',
      "line\nbreak",
      "control\u0001byte",
      "$(id)",
      "audit;whoami",
      "audit ref",
      "audit\\escape",
      "audit|extra",
    ]) expect(safeRef.test(value)).toBe(false);
    for (const value of ["audit:00038/cycle-2", "G4:approved-00038", "https://github.com/effectstream/effectstream/pull/1"]) {
      expect(safeRef.test(value)).toBe(true);
    }

    for (const body of runBodies(recover)) expect(body).not.toContain("${{ inputs.");
  });

  test("strict release tags map to trusted remote refs before checkout", () => {
    const sourceProof = step("Verify trusted recovery refs before checkout");
    expect(sourceProof).toContain('^v0\\.104\\.(0|[1-9][0-9]*)$');
    expect(sourceProof).toContain('^v0\\.200\\.(0|[1-9][0-9]*)$');
    expect(sourceProof).toContain("SOURCE_BRANCH='midnight-1'");
    expect(sourceProof).toContain("DIST_TAG='midnight-1'");
    expect(sourceProof).toContain("SOURCE_BRANCH='v-next'");
    expect(sourceProof).toContain("DIST_TAG='latest'");
    expect(sourceProof).toContain("DIST_TAG='next'");
    expect(sourceProof).toContain('git -C "$RECOVERY_VERIFY_DIR" fetch --no-tags');
  });

  test("GH_TOKEN is absent until the final trusted version push", () => {
    expect(recover.match(/^\s+GH_TOKEN:/gm)).toHaveLength(1);
    expect(step("Commit and push recovered version-only delta")).toContain(
      "GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}",
    );
    for (const name of [
      "Require default-branch trusted caller identity",
      "Require the complete audited mutation identity",
      "Verify trusted recovery refs before checkout",
      "Checkout exact trusted current branch head",
      "Compare checked-out policy with trusted source mapping",
      "Download original immutable release bundle",
      "Verify original service and embedded identities",
      "Complete exact artifact publication and apply version delta",
    ]) expect(step(name)).not.toContain("GH_TOKEN:");
  });

  test("workflow static boundary removes tokens, pins OIDC tools, and adds aggregate release CI", () => {
    const workflows = join(import.meta.dir, "workflows");
    const main = readFileSync(join(workflows, "main.yaml"), "utf8");
    expect(existsSync(join(workflows, "release-recovery.yaml"))).toBe(false);
    expect(workflow.trimStart()).toContain("permissions: {}");
    expect(workflow.match(/id-token:\s*write/g)).toHaveLength(2);
    for (const forbidden of [
      "NPM_TOKEN",
      "BUN_AUTH_TOKEN",
      "NPM_CONFIG_TOKEN",
      "NODE_AUTH_TOKEN",
      "_authToken",
    ]) expect(workflow).not.toContain(forbidden);
    expect(workflow).toContain("actions/setup-node@820762786026740c76f36085b0efc47a31fe5020");
    expect(workflow.match(/node-version:\s*24\.20\.0/g)).toHaveLength(2);
    expect(workflow.match(/--visibility-timeout-ms 1800000/g)).toHaveLength(2);
    expect(main).toContain("  release-tests:");
    expect(main).toContain("needs: [changes, e2e, template-tests, frontend-build, assets-check, release-tests]");
  });
});
