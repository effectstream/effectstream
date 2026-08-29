import { describe, expect, test } from "bun:test";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "fs";
import { tmpdir } from "os";
import { join } from "path";
import {
  EXPECTED_PACKAGE_COUNT,
  RegistryVisibilityTimeoutError,
  assertRecoveryLatestPrecondition,
  assertRecoveryExistingTagPreconditions,
  assertSafeNpmEnvironment,
  canonicalJson,
  createNpmExecutionSandbox,
  isSecretLikeTarEntry,
  classifyRecoveryMode,
  compareSemver,
  npmPublishArgv,
  parseSemver,
  planRegistryCompletion,
  pollRegistryPostconditions,
  preflightOrdinary,
  resolveDistTag,
  resolveReleasePolicy,
  resolveReleaseVersion,
  setVersionInText,
  verifyLatestPostcondition,
  type RegistryPackageState,
  type ReleaseManifest,
  type ReleasePolicy,
} from "./publish-bun.effectstream";

const packageNames = Array.from(
  { length: EXPECTED_PACKAGE_COUNT },
  (_, index) => `@effectstream/package-${String(index).padStart(2, "0")}`,
);

function states(
  latest: string | ((index: number) => string | undefined) = "0.200.2",
  targetIntegrity: string | null | ((index: number) => string | null) = null,
  selectedTag?: { name: string; version: string },
): RegistryPackageState[] {
  return packageNames.map((name, index) => {
    const latestValue = typeof latest === "function" ? latest(index) : latest;
    const integrity =
      typeof targetIntegrity === "function" ? targetIntegrity(index) : targetIntegrity;
    return {
      name,
      targetIntegrity: integrity,
      distTags: {
        ...(latestValue ? { latest: latestValue } : {}),
        ...(selectedTag ? { [selectedTag.name]: selectedTag.version } : {}),
      },
    };
  });
}

function manifest(policy: ReleasePolicy): ReleaseManifest {
  return {
    schemaVersion: 1,
    releaseTag: policy.releaseTag,
    version: policy.version,
    sourceSha: "a".repeat(40),
    branch: policy.branch,
    distTag: policy.distTag,
    prerelease: policy.prerelease,
    kind: policy.kind,
    workflow: { runId: "123", runAttempt: "1" },
    toolchain: { bun: "1.4.0", platform: "linux-x64" },
    latestBefore: Object.fromEntries(packageNames.map((name) => [name, "0.200.2"])),
    packages: packageNames.map((name, index) => ({
      name,
      relativeDir: `packages/${index}`,
      filename: `package-${index}.tgz`,
      size: 1,
      sha512: String(index),
      integrity: `sha512-${index}`,
      versionBefore: policy.kind === "maintenance-stable" ? "0.104.1" : "0.200.2",
    })),
  };
}

describe("strict SemVer", () => {
  test("orders core and prerelease values without precision loss", () => {
    expect(compareSemver(parseSemver("0.200.3-rc.1"), parseSemver("0.200.2"))).toBeGreaterThan(0);
    expect(compareSemver(parseSemver("9007199254740993.0.0"), parseSemver("9007199254740992.9.9"))).toBeGreaterThan(0);
    expect(compareSemver(parseSemver("1.0.0-alpha"), parseSemver("1.0.0"))).toBeLessThan(0);
  });

  test.each([
    "v1.2",
    "01.2.3",
    "1.02.3",
    "1.2.03",
    "1.2.3-01",
    "1.2.3+",
    " 0.200.3",
    "0.200.3 ",
  ])("rejects malformed form %s", (value) => {
    expect(() => parseSemver(value)).toThrow(/valid SemVer/);
  });

  test("requires a strictly greater branch-local version", () => {
    expect(resolveReleaseVersion("v0.104.2", "0.104.1")).toBe("0.104.2");
    expect(() => resolveReleaseVersion("v0.104.1", "0.104.1")).toThrow(/strictly greater/);
    expect(() => resolveReleaseVersion("v0.104.0", "0.104.1")).toThrow(/strictly greater/);
  });
});

describe("closed release policy", () => {
  test.each([
    ["v0.104.2", false, "midnight-1", "midnight-1", "maintenance-stable"],
    ["v0.200.3", false, "v-next", "latest", "node2-stable"],
    ["v0.200.3-rc.1", true, "v-next", "next", "node2-prerelease"],
  ])("maps %s", (tag, prerelease, branch, distTag, kind) => {
    expect(resolveReleasePolicy(tag, branch, distTag, prerelease)).toMatchObject({
      branch,
      distTag,
      prerelease,
      kind,
    });
  });

  test.each([
    ["v0.104.2", "v-next", "midnight-1", false],
    ["v0.104.2", "midnight-1", "latest", false],
    ["v0.200.3", "midnight-1", "latest", false],
    ["v0.200.3", "v-next", "next", false],
    ["v0.200.3-rc.1", "v-next", "latest", true],
    ["v0.200.3-rc.1", "midnight-1", "next", true],
  ])("rejects mismatched tuple %s/%s/%s", (tag, branch, distTag, prerelease) => {
    expect(() => resolveReleasePolicy(tag, branch, distTag, prerelease)).toThrow();
  });

  test.each([
    "v0.103.999",
    "v0.104.2-rc.1",
    "v0.104.2+build.1",
    "v0.105.0",
    "v0.199.999",
    "v0.200.3+build.1",
    "v0.201.0",
    "v1.0.0",
    "0.104.2",
  ])("rejects unsupported form %s", (tag) => {
    expect(() => resolveReleasePolicy(tag)).toThrow();
  });

  test("requires the only allowed explicit dist-tag", () => {
    expect(resolveDistTag("0.104.2", "midnight-1")).toBe("midnight-1");
    expect(resolveDistTag("0.200.3", "latest")).toBe("latest");
    expect(resolveDistTag("0.200.3-rc.1", "next")).toBe("next");
    expect(() => resolveDistTag("0.104.2")).toThrow(/required/);
    expect(() => resolveDistTag("0.104.2", "latest")).toThrow();
  });
});

describe("all-package ordinary preflight", () => {
  test.each(["v0.104.2", "v0.200.3", "v0.200.3-rc.1"])(
    "accepts absent targets and one stable Node-2 latest snapshot for %s",
    (tag) => {
      const policy = resolveReleasePolicy(tag);
      const snapshot = preflightOrdinary(policy, states());
      expect(Object.keys(snapshot)).toHaveLength(EXPECTED_PACKAGE_COUNT);
      expect(new Set(Object.values(snapshot))).toEqual(new Set(["0.200.2"]));
    },
  );

  test.each([
    ["occupied target", states("0.200.2", (index) => (index === 8 ? "sha512-existing" : null))],
    ["missing latest", states((index) => (index === 8 ? undefined : "0.200.2"))],
    ["mixed patches", states((index) => (index === 8 ? "0.200.1" : "0.200.2"))],
    ["wrong family", states("0.104.1")],
    ["prerelease latest", states("0.200.3-rc.1")],
  ])("rejects %s with no mutation plan", (_name, registryStates) => {
    expect(() => preflightOrdinary(resolveReleasePolicy("v0.104.2"), registryStates)).toThrow();
  });

  test("stable Node-2 target must be above the uniform current latest", () => {
    expect(() => preflightOrdinary(resolveReleasePolicy("v0.200.2"), states())).toThrow(/greater/);
  });
});

describe("persisted exact-tarball completion", () => {
  const maintenance = manifest(resolveReleasePolicy("v0.104.2"));

  test("ordinary run requires every target absent", () => {
    expect(planRegistryCompletion(maintenance, states(), false).missing).toEqual(packageNames);
    expect(() =>
      planRegistryCompletion(
        maintenance,
        states("0.200.2", (index) => (index === 0 ? "sha512-0" : null)),
        false,
      ),
    ).toThrow(/occupied/);
  });

  test("recovery skips exact prefix and non-prefix subsets only", () => {
    for (const occupied of [new Set([0, 1, 2]), new Set([1, 9, 25])]) {
      const result = planRegistryCompletion(
        maintenance,
        states("0.200.2", (index) => (occupied.has(index) ? `sha512-${index}` : null)),
        true,
      );
      expect(result.existing).toEqual([...occupied].sort((a, b) => a - b).map((i) => packageNames[i]));
      expect(result.missing).toHaveLength(EXPECTED_PACKAGE_COUNT - occupied.size);
    }
  });

  test("recovery rejects any occupied version with different integrity", () => {
    expect(() =>
      planRegistryCompletion(
        maintenance,
        states("0.200.2", (index) => (index === 4 ? "sha512-tampered" : null)),
        true,
      ),
    ).toThrow(/differs/);
  });
});

describe("OIDC-only npm subprocess boundary", () => {
  test("uses the exact absolute tarball argv in the required order", () => {
    expect(npmPublishArgv("https://registry.example.test/", "midnight-1", "/bundle/exact.tgz")).toEqual([
      "npm",
      "publish",
      "--access",
      "public",
      "--tag",
      "midnight-1",
      "--registry",
      "https://registry.example.test/",
      "/bundle/exact.tgz",
    ]);
  });

  test("rejects named tokens and every ambient NPM_CONFIG alias before spawn", () => {
    for (const name of [
      "NPM_TOKEN",
      "BUN_AUTH_TOKEN",
      "NPM_CONFIG_TOKEN",
      "NODE_AUTH_TOKEN",
      "npm_config_userconfig",
      "NPM_CONFIG_GLOBALCONFIG",
      "NPM_CONFIG_REGISTRY",
    ]) {
      expect(() => assertSafeNpmEnvironment({ PATH: "/bin", [name]: "sentinel-do-not-send" })).toThrow(
        /forbidden npm credential|ambient npm config/i,
      );
    }
  });

  test("isolates project/user/global config and preserves only the OIDC pair byte-for-byte", () => {
    const poison = mkdtempSync(join(tmpdir(), "effectstream-npm-poison-"));
    const caller = join(poison, "caller-project");
    const home = join(poison, "caller-home");
    mkdirSync(caller);
    mkdirSync(home);
    writeFileSync(join(caller, ".npmrc"), "//registry.example.test/:_authToken=project-sentinel\n");
    writeFileSync(join(home, ".npmrc"), "//registry.example.test/:_authToken=user-sentinel\n");
    const oidcUrl = "https://oidc.example.test/request?opaque=byte%2Fvalue";
    const oidcToken = "github-oidc-request-token-sentinel";
    const sandbox = createNpmExecutionSandbox({
      PATH: process.env.PATH,
      PWD: caller,
      HOME: home,
      ACTIONS_ID_TOKEN_REQUEST_URL: oidcUrl,
      ACTIONS_ID_TOKEN_REQUEST_TOKEN: oidcToken,
    });
    try {
      expect(sandbox.cwd).not.toBe(caller);
      expect(sandbox.home).not.toBe(home);
      expect(readFileSync(sandbox.userConfig, "utf8")).toBe("");
      expect(readFileSync(sandbox.globalConfig, "utf8")).toBe("");
      expect(sandbox.env.NPM_CONFIG_USERCONFIG).toBe(sandbox.userConfig);
      expect(sandbox.env.NPM_CONFIG_GLOBALCONFIG).toBe(sandbox.globalConfig);
      expect(sandbox.env.ACTIONS_ID_TOKEN_REQUEST_URL).toBe(oidcUrl);
      expect(sandbox.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN).toBe(oidcToken);
      expect(canonicalJson({ cwd: sandbox.cwd, home: sandbox.home })).not.toContain(oidcToken);
      expect(canonicalJson({ cwd: sandbox.cwd, home: sandbox.home })).not.toContain("sentinel");
    } finally {
      const root = sandbox.root;
      sandbox.cleanup();
      expect(existsSync(root)).toBe(false);
      rmSync(poison, { recursive: true, force: true });
    }
  });
});

describe("recovery tags and delayed registry visibility", () => {
  test.each(["v0.104.2", "v0.200.3", "v0.200.3-rc.1"])(
    "%s rejects exact existing bytes with a missing or wrong required channel before mutation",
    (tag) => {
      const item = manifest(resolveReleasePolicy(tag));
      const exact = states(
        item.kind === "node2-stable" ? item.version : "0.200.2",
        (index) => (index === 0 ? "sha512-0" : null),
        { name: item.distTag, version: item.version },
      );
      expect(() => assertRecoveryExistingTagPreconditions(item, exact, [packageNames[0]])).not.toThrow();
      for (const wrong of [undefined, "9.9.9"]) {
        const drift = structuredClone(exact);
        if (wrong) drift[0].distTags[item.distTag] = wrong;
        else delete drift[0].distTags[item.distTag];
        expect(() => assertRecoveryExistingTagPreconditions(item, drift, [packageNames[0]])).toThrow(
          /tag drift/i,
        );
      }
    },
  );

  test("polls all packages in rounds under one shared deadline and succeeds after delay", async () => {
    const item = manifest(resolveReleasePolicy("v0.104.2"));
    let time = 100;
    let rounds = 0;
    const sleeps: number[] = [];
    await pollRegistryPostconditions(item, {
      timeoutMs: 1_000,
      now: () => time,
      sleep: async (ms) => {
        sleeps.push(ms);
        time += ms;
        rounds++;
      },
      read: async (_registry, name) => {
        const visible = rounds >= 2;
        return {
          name,
          targetIntegrity: visible ? item.packages.find((pkg) => pkg.name === name)!.integrity : null,
          distTags: visible ? { latest: "0.200.2", "midnight-1": item.version } : { latest: "0.200.2" },
        };
      },
      registry: "https://registry.example.test",
      initialBackoffMs: 100,
      maxBackoffMs: 200,
    });
    expect(sleeps).toEqual([100, 200]);
    expect(time).toBe(400);
  });

  test("one deadline marks every pending package and terminal conflicts do not sleep", async () => {
    const item = manifest(resolveReleasePolicy("v0.104.2"));
    let time = 0;
    const sleeps: number[] = [];
    try {
      await pollRegistryPostconditions(item, {
        timeoutMs: 250,
        now: () => time,
        sleep: async (ms) => {
          sleeps.push(ms);
          time += ms;
        },
        read: async (_registry, name) => ({ name, targetIntegrity: null, distTags: { latest: "0.200.2" } }),
        registry: "https://registry.example.test",
        initialBackoffMs: 100,
        maxBackoffMs: 200,
      });
      throw new Error("expected visibility timeout");
    } catch (error) {
      expect(error).toBeInstanceOf(RegistryVisibilityTimeoutError);
      expect((error as RegistryVisibilityTimeoutError).pending).toEqual(packageNames);
    }
    expect(sleeps).toEqual([100, 150]);

    for (const terminal of ["integrity", "tag", "latest", "http"] as const) {
      let slept = false;
      await expect(
        pollRegistryPostconditions(item, {
          timeoutMs: 1_000,
          now: () => 0,
          sleep: async () => { slept = true; },
          read: async (_registry, name) => {
            if (terminal === "http") throw new Error("Registry query failed: HTTP 503");
            const pkg = item.packages.find((candidate) => candidate.name === name)!;
            return {
              name,
              targetIntegrity: terminal === "integrity" ? "sha512-conflict" : pkg.integrity,
              distTags: {
                latest: terminal === "latest" ? "0.200.1" : "0.200.2",
                "midnight-1": terminal === "tag" ? "9.9.9" : item.version,
              },
            };
          },
          registry: "https://registry.example.test",
        }),
      ).rejects.toThrow(/integrity|tag|latest|HTTP 503/i);
      expect(slept).toBe(false);
    }
  });
});

describe("release-kind postconditions", () => {
  test("maintenance and Node-2 prerelease preserve latest exactly", () => {
    for (const tag of ["v0.104.2", "v0.200.3-rc.1"]) {
      const item = manifest(resolveReleasePolicy(tag));
      expect(() =>
        verifyLatestPostcondition(
          item,
          states("0.200.2", `sha512-unused`, { name: item.distTag, version: item.version }),
        ),
      ).not.toThrow();
      expect(() =>
        verifyLatestPostcondition(
          item,
          states((index) => (index === 2 ? "0.200.1" : "0.200.2"), `sha512-unused`, {
            name: item.distTag,
            version: item.version,
          }),
        ),
      ).toThrow(/latest changed/);
    }
  });

  test("stable Node-2 requires every latest at the target", () => {
    const item = manifest(resolveReleasePolicy("v0.200.3"));
    expect(() =>
      verifyLatestPostcondition(
        item,
        states("0.200.3", `sha512-unused`, { name: "latest", version: "0.200.3" }),
      ),
    ).not.toThrow();
    expect(() =>
      verifyLatestPostcondition(
        item,
        states((index) => (index === 1 ? "0.200.2" : "0.200.3"), `sha512-unused`),
      ),
    ).toThrow(/expected/);
  });

  test("stable Node-2 recovery accepts only persisted-prestate or target during a tag loop", () => {
    const item = manifest(resolveReleasePolicy("v0.200.3"));
    expect(() =>
      assertRecoveryLatestPrecondition(
        item,
        states((index) => (index % 2 ? "0.200.2" : "0.200.3")),
      ),
    ).not.toThrow();
    expect(() =>
      assertRecoveryLatestPrecondition(
        item,
        states((index) => (index === 3 ? "0.200.1" : "0.200.2")),
      ),
    ).toThrow(/neither/);
  });

  test("maintenance and prerelease recovery reject any latest snapshot drift", () => {
    for (const tag of ["v0.104.2", "v0.200.3-rc.1"]) {
      const item = manifest(resolveReleasePolicy(tag));
      expect(() => assertRecoveryLatestPrecondition(item, states())).not.toThrow();
      expect(() =>
        assertRecoveryLatestPrecondition(
          item,
          states((index) => (index === 3 ? "0.200.1" : "0.200.2")),
        ),
      ).toThrow(/differs/);
    }
  });
});

describe("recovery matrix", () => {
  test.each([
    [true, false, "partial-tag"],
    [false, false, "complete-tag"],
    [true, true, "partial-advanced"],
    [false, true, "complete-advanced"],
  ])("partial=%p advanced=%p => %s", (partial, advanced, expected) => {
    expect(classifyRecoveryMode(partial, advanced)).toBe(expected);
  });
});

describe("workflow invariants", () => {
  const workflows = join(import.meta.dir, "workflows");
  const release = readFileSync(join(workflows, "release.yaml"), "utf8");
  const rehearsal = readFileSync(join(workflows, "release-artifact-rehearsal.yaml"), "utf8");
  const main = readFileSync(join(workflows, "main.yaml"), "utf8");

  test("one release.yaml caller owns mutually exclusive release, proof, and recovery jobs", () => {
    expect(release).toContain("release:");
    expect(release).toContain("workflow_dispatch:");
    expect(release).toContain("  publish:");
    expect(release).toContain("  artifact-proof:");
    expect(release).toContain("  recover:");
    expect(release).toContain("github.event_name == 'release'");
    expect(release).toContain("github.event_name == 'workflow_dispatch'");
    expect(existsSync(join(workflows, "release-recovery.yaml"))).toBe(false);
    expect(release).toContain("group: release-publish");
    expect(release).toContain("cancel-in-progress: false");
  });

  test("guard and immutable upload precede auth and persisted-byte publish", () => {
    const order = [
      "Verify immutable release source identity",
      "Setup Bun",
      "Install dependencies",
      "Preflight registry and prepare exact release bundle",
      "Upload immutable release bundle before authentication or mutation",
      "Setup exact Node and npm after release validation",
      "Assert exact Node and npm versions",
      "Publish exact persisted tarballs",
      "Commit and push version-only delta",
    ].map((needle) => release.indexOf(needle));
    expect(order.every((position) => position >= 0)).toBe(true);
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(release).toContain("retention-days: 90");
    expect(release).toContain("steps.release-source.outputs.dist-tag");
    expect(release).toContain('git push origin "HEAD:refs/heads/$SOURCE_BRANCH"');
    expect(release).not.toContain("HEAD:refs/heads/v-next");
  });

  test("recovery caller identity and compatibility are proven before npm setup or mutation", () => {
    const order = [
      "Require default-branch trusted caller identity",
      "Verify original service and embedded identities",
      "Validate recovery branch compatibility before authentication or mutation",
      "Setup exact Node and npm after recovery validation",
      "Assert exact recovery Node and npm versions",
      "Complete exact artifact publication and apply version delta",
    ].map((needle) => release.indexOf(needle));
    expect(order.every((position) => position >= 0)).toBe(true);
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(release).toContain("--validate-recovery-branch");
    expect(release).toContain("GITHUB_WORKFLOW_REF");
    expect(release).toContain(".github/workflows/release.yaml@refs/heads/");
  });

  test("ordinary and recovery attempts persist separate result evidence under always", () => {
    expect(release).toContain("steps.publish.outcome != 'skipped'");
    expect(release).toContain("effectstream-release-bundle.publish-result.json");
    expect(release).toContain("release-result-${{ github.event.release.tag_name }}");
    expect(release).toContain("steps.recover-publication.outcome != 'skipped'");
    expect(release).toContain("recovery-result-${{ inputs.release_tag }}");
    expect(release.match(/effectstream-release-bundle\.publish-result\.json/g)?.length).toBeGreaterThanOrEqual(2);
    expect(release).toContain("if-no-files-found: error");
    expect(release).toContain("retention-days: 90");
  });

  test("all privileged actions are immutable pins", () => {
    for (const workflow of [release, rehearsal, main]) {
      for (const match of workflow.matchAll(/uses:\s+([^\s#]+)/g)) {
        expect(match[1]).toMatch(/@[0-9a-f]{40}$/);
      }
    }
  });

  test("recovery stays cross-run and reviewer-gated without rerunning release", () => {
    expect(release).toContain("environment: npm-release-recovery");
    expect(release).toContain("run-id: ${{ inputs.original_run_id }}");
    expect(release).toContain("artifact-ids: ${{ inputs.artifact_id }}");
    expect(release).not.toContain("run-attempt: ${{ inputs");
  });

  test("only the two mutation jobs can mint OIDC and proof/PR CI remain read-only", () => {
    expect(release.trimStart()).toContain("permissions: {}");
    expect(release.match(/id-token:\s*write/g)).toHaveLength(2);
    expect(rehearsal).toContain("contents: read");
    expect(rehearsal).not.toContain("id-token: write");
    expect(rehearsal).not.toContain("environment:");
    expect(rehearsal).not.toContain("actions/checkout");
    const proof = release.slice(release.indexOf("  artifact-proof:"), release.indexOf("  recover:"));
    expect(proof).toContain("actions: read");
    expect(proof).toContain("contents: read");
    expect(proof).not.toContain("id-token: write");
    expect(proof).not.toContain("npm publish");
    expect(proof).not.toContain("environment:");
    expect(main).not.toContain("id-token: write");
  });

  test("forbids legacy auth plumbing, pins exact tools, and gates release tests", () => {
    for (const forbidden of [
      "NPM_TOKEN",
      "BUN_AUTH_TOKEN",
      "NPM_CONFIG_TOKEN",
      "NODE_AUTH_TOKEN",
      "_authToken",
      "Configure npm auth",
    ]) expect(release).not.toContain(forbidden);
    expect(release).toContain("actions/setup-node@820762786026740c76f36085b0efc47a31fe5020");
    expect(release.match(/node-version:\s*24\.20\.0/g)).toHaveLength(2);
    expect(release.match(/test \"\$\(node --version\)\" = 'v24\.20\.0'/g)).toHaveLength(2);
    expect(release.match(/test \"\$\(npm --version\)\" = '11\.19\.0'/g)).toHaveLength(2);
    expect(release.match(/--visibility-timeout-ms 1800000/g)).toHaveLength(2);
    expect(main).toContain("  release-tests:");
    expect(main).toContain("!github.event.pull_request.draft");
    expect(main).toContain('"effectstream-release-tests:${{ github.sha }}" bash -lc');
    expect(main).not.toContain('"effectstream-release-tests:${{ github.sha }}" sh -lc');
    expect(main).toContain("git config --global --add safe.directory /work");
    expect(main).toContain("release-tests=${{ needs.release-tests.result }}");
    expect(main).toContain("needs: [changes, e2e, template-tests, frontend-build, assets-check, release-tests]");
  });
});

describe("canonical and version-only bytes", () => {
  test("secret-like bundle paths reject credentials without rejecting token source code", () => {
    for (const path of [
      "package/.npmrc",
      "package/.env.production",
      "package/npm-token.txt",
      "package/secrets.json",
      "package/id_ed25519",
      "package/signing.pem",
    ]) expect(isSecretLikeTarEntry(path)).toBe(true);
    for (const path of [
      "package/src/contracts/token/Token.sol",
      "package/src/midnight-token-mint.ts",
      "package/src/secret-sharing.ts",
    ]) expect(isSecretLikeTarEntry(path)).toBe(false);
  });

  test("canonical JSON recursively sorts keys", () => {
    expect(canonicalJson({ z: 1, a: { y: 2, b: 3 } })).toBe('{"a":{"b":3,"y":2},"z":1}\n');
  });

  test("changes only the first package version field", () => {
    const source = '{ "version": "0.104.1", "engines": { "version": "x" } }';
    expect(setVersionInText(source, "0.104.2")).toBe(
      '{ "version": "0.104.2", "engines": { "version": "x" } }',
    );
  });
});
