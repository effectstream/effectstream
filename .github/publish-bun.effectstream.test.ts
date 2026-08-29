import { describe, expect, test } from "bun:test";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
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
      documentReadable: true,
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
          documentReadable: true,
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
        read: async (_registry, name) => ({ name, documentReadable: true, targetIntegrity: null, distTags: { latest: "0.200.2" } }),
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
              documentReadable: true,
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

  test("late and never-settling read rounds expire under the one shared deadline", async () => {
    const item = manifest(resolveReleasePolicy("v0.104.2"));
    let lateTime = 0;
    try {
      await pollRegistryPostconditions(item, {
        timeoutMs: 100,
        now: () => lateTime,
        sleep: async () => { throw new Error("late round must not sleep"); },
        read: async (_registry, name) => {
          lateTime = 101;
          const pkg = item.packages.find((candidate) => candidate.name === name)!;
          return {
            name,
            documentReadable: true,
            targetIntegrity: pkg.integrity,
            distTags: { latest: "0.200.2", "midnight-1": item.version },
          };
        },
        registry: "https://registry.example.test",
      });
      throw new Error("expected late-round visibility timeout");
    } catch (error) {
      expect(error).toBeInstanceOf(RegistryVisibilityTimeoutError);
      expect((error as RegistryVisibilityTimeoutError).pending).toEqual(packageNames);
    }

    let aborted = 0;
    const neverSettles = pollRegistryPostconditions(item, {
      timeoutMs: 5,
      read: async (_registry, _name, _version, signal) => await new Promise((_resolve, reject) => {
        signal?.addEventListener("abort", () => {
          aborted++;
          reject(new Error("aborted registry read"));
        }, { once: true });
      }),
      registry: "https://registry.example.test",
    });
    await expect(
      Promise.race([
        neverSettles,
        Bun.sleep(100).then(() => { throw new Error("test guard: registry round was not bounded"); }),
      ]),
    ).rejects.toBeInstanceOf(RegistryVisibilityTimeoutError);
    expect(aborted).toBe(EXPECTED_PACKAGE_COUNT);
  });

  test.each([
    ["v0.104.2", "required-tag"],
    ["v0.104.2", "latest"],
    ["v0.200.3", "required-tag"],
    ["v0.200.3", "latest"],
    ["v0.200.3-rc.1", "required-tag"],
    ["v0.200.3-rc.1", "latest"],
  ] as const)("%s rejects readable hidden-target %s conflicts immediately", async (tag, conflict) => {
    const item = manifest(resolveReleasePolicy(tag));
    let slept = false;
    await expect(
      pollRegistryPostconditions(item, {
        timeoutMs: 10,
        now: () => slept ? 10 : 0,
        sleep: async () => { slept = true; },
        read: async (_registry, name) => ({
          name,
          documentReadable: true,
          targetIntegrity: null,
          distTags: conflict === "latest"
            ? { latest: "9.9.9" }
            : {
                latest: item.kind === "node2-stable" ? item.version : item.latestBefore[name],
                [item.distTag]: item.version,
              },
        }),
        registry: "https://registry.example.test",
      }),
    ).rejects.toThrow(/hidden target.*(?:tag|latest)|(?:tag|latest).*hidden target/i);
    expect(slept).toBe(false);
  });

  test("an unreadable package document remains transient without trusting its channel fields", async () => {
    const item = manifest(resolveReleasePolicy("v0.104.2"));
    let time = 0;
    await expect(
      pollRegistryPostconditions(item, {
        timeoutMs: 10,
        now: () => time,
        sleep: async (ms) => { time += ms; },
        read: async (_registry, name) => ({
          name,
          documentReadable: false,
          targetIntegrity: null,
          distTags: { latest: "9.9.9", "midnight-1": item.version },
        }),
        registry: "https://registry.example.test",
      }),
    ).rejects.toBeInstanceOf(RegistryVisibilityTimeoutError);
  });

  test("success requires one coherent all-39 round and catches early verified drift", async () => {
    const item = manifest(resolveReleasePolicy("v0.104.2"));
    let round = 0;
    await expect(
      pollRegistryPostconditions(item, {
        timeoutMs: 1_000,
        now: () => round * 10,
        sleep: async () => { round++; },
        read: async (_registry, name) => {
          const pkg = item.packages.find((candidate) => candidate.name === name)!;
          const first = name === packageNames[0];
          return {
            name,
            documentReadable: true,
            targetIntegrity: first || round > 0 ? pkg.integrity : null,
            distTags: {
              latest: "0.200.2",
              ...(first && round > 0
                ? { "midnight-1": "9.9.9" }
                : { "midnight-1": item.version }),
            },
          };
        },
        registry: "https://registry.example.test",
      }),
    ).rejects.toThrow(/tag conflict/i);
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
  const workflowFiles = readdirSync(workflows)
    .filter((name) => /\.ya?ml$/.test(name))
    .sort();

  function jobBlock(source: string, name: string, next?: string): string {
    const start = source.indexOf(`  ${name}:`);
    expect(start).toBeGreaterThanOrEqual(0);
    const end = next ? source.indexOf(`  ${next}:`, start + 1) : source.length;
    expect(end).toBeGreaterThan(start);
    return source.slice(start, end);
  }

  function stepRun(source: string, name: string): string {
    const stepStart = source.indexOf(`      - name: ${name}`);
    expect(stepStart).toBeGreaterThanOrEqual(0);
    const runStart = source.indexOf("        run: |\n", stepStart);
    expect(runStart).toBeGreaterThan(stepStart);
    const lines = source.slice(runStart + "        run: |\n".length).split("\n");
    const body: string[] = [];
    for (const line of lines) {
      if (line && !line.startsWith("          ")) break;
      body.push(line.startsWith("          ") ? line.slice(10) : line);
    }
    return body.join("\n");
  }

  type WorkflowSources = Map<string, string>;

  function currentLiteralBoundaryViolations(sources: WorkflowSources): string[] {
    const violations: string[] = [];
    if (canonicalJson([...sources.keys()].sort()) !== canonicalJson([
      "main.yaml",
      "release-artifact-rehearsal.yaml",
      "release.yaml",
    ])) violations.push("unexpected workflow file set");

    for (const [name, source] of sources) {
      for (const forbidden of [
        "NPM_TOKEN",
        "BUN_AUTH_TOKEN",
        "NPM_CONFIG_TOKEN",
        "NODE_AUTH_TOKEN",
        "_authToken",
        ".npmrc",
        "Configure npm auth",
      ]) if (source.includes(forbidden)) violations.push(`${name} contains ${forbidden}`);
      for (const match of source.matchAll(/uses:\s+([^\s#]+)/g)) {
        if (!/@[0-9a-f]{40}$/.test(match[1])) violations.push(`${name} has a mutable action pin`);
      }
      if (name !== "release.yaml") {
        if (source.includes("id-token: write")) violations.push(`${name} grants OIDC`);
        if (/--publish(?:-bundle)?\b/.test(source)) violations.push(`${name} publishes`);
        if (source.includes("--recover-bundle")) violations.push(`${name} recovers`);
        if (/\bgit push\b/.test(source)) violations.push(`${name} pushes release state`);
      }
    }

    const releaseSource = sources.get("release.yaml")!;
    const publish = jobBlock(releaseSource, "publish", "artifact-proof");
    const proof = jobBlock(releaseSource, "artifact-proof", "recover");
    const recover = jobBlock(releaseSource, "recover");
    if ((publish.match(/id-token:\s*write/g) ?? []).length !== 1) violations.push("publish OIDC count");
    if ((recover.match(/id-token:\s*write/g) ?? []).length !== 1) violations.push("recover OIDC count");
    if (proof.includes("id-token: write")) violations.push("proof grants OIDC");
    if ((publish.match(/--publish-bundle --publish/g) ?? []).length !== 1) violations.push("publish entry count");
    if ((recover.match(/--recover-bundle --publish/g) ?? []).length !== 1) violations.push("recover entry count");
    if ((publish.match(/\bgit push\b/g) ?? []).length !== 1) violations.push("publish push count");
    if ((recover.match(/\bgit push\b/g) ?? []).length !== 1) violations.push("recover push count");
    if (/--publish|--recover-bundle|\bgit push\b/.test(proof)) violations.push("proof mutation");
    return violations;
  }

  type WorkflowRecord = Record<string, unknown>;

  function workflowRecord(value: unknown, label: string): WorkflowRecord {
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
      throw new Error(`${label} must be an object`);
    }
    return value as WorkflowRecord;
  }

  function normalizedProperty(
    object: WorkflowRecord,
    expectedKey: string,
    label: string,
  ): unknown {
    const matches = Object.entries(object)
      .filter(([key]) => key.toLowerCase() === expectedKey.toLowerCase());
    if (matches.length > 1) throw new Error(`${label} has duplicate ${expectedKey} keys`);
    return matches[0]?.[1];
  }

  function assertNoLegacyAuthIndicators(value: unknown, label: string): void {
    const reject = (candidate: string, candidateLabel: string) => {
      const normalized = candidate.toLowerCase();
      if (
        /(?:^|[^a-z0-9])(?:npm_token|bun_auth_token|node_auth_token|npm_config(?:_[a-z0-9_]*)?|_authtoken)(?:$|[^a-z0-9])/.test(normalized)
        || normalized.includes(".npmrc")
        || /configure\s+npm\s+auth/.test(normalized)
      ) throw new Error(`${candidateLabel} contains a forbidden npm auth/config indicator`);
    };

    if (typeof value === "string") {
      reject(value, label);
      return;
    }
    if (Array.isArray(value)) {
      value.forEach((item, index) => assertNoLegacyAuthIndicators(item, `${label}[${index}]`));
      return;
    }
    if (value !== null && typeof value === "object") {
      for (const [key, child] of Object.entries(value)) {
        reject(key, `${label} key`);
        assertNoLegacyAuthIndicators(child, `${label}.${key}`);
      }
    }
  }

  function shellSegments(run: string): string[][] {
    const joined = run.replace(/\\\r?\n\s*/g, " ");
    return joined.split(/\r?\n|&&|\|\||[;|]/).map((segment) => (
      segment.match(/"(?:\\.|[^"])*"|'(?:\\.|[^'])*'|[^\s]+/g)
        ?.map((word) => word.replace(/^(?:"([\s\S]*)"|'([\s\S]*)')$/, "$1$2")) ?? []
    ));
  }

  const npmPublishSpellings = new Set([
    "pu",
    "pub",
    "publ",
    "publi",
    "publis",
    "publish",
  ]);

  function shellInvokes(run: string, command: "npm" | "git", subcommand: "publish" | "push"): boolean {
    for (const words of shellSegments(run)) {
      const commandIndex = words.findIndex((word) => word === command || word.endsWith(`/${command}`));
      if (commandIndex < 0) continue;
      const argumentsAfterCommand = words.slice(commandIndex + 1);
      if (command === "npm" && subcommand === "publish") {
        if (argumentsAfterCommand.some((word) => npmPublishSpellings.has(word))) return true;
      } else if (argumentsAfterCommand.includes(subcommand)) return true;
    }
    return false;
  }

  function publisherEntrypoints(run: string): { ordinary: boolean; recovery: boolean } {
    let ordinary = false;
    let recovery = false;
    for (const words of shellSegments(run)) {
      const publisherIndex = words.findIndex((word) =>
        word === ".github/publish-bun.effectstream.ts"
        || word.endsWith("/.github/publish-bun.effectstream.ts"));
      if (publisherIndex < 0) continue;
      const args = words.slice(publisherIndex + 1);
      if (!args.includes("--publish")) continue;
      ordinary ||= args.includes("--publish-bundle");
      recovery ||= args.includes("--recover-bundle");
    }
    return { ordinary, recovery };
  }

  function assertWorkflowBoundary(sources: WorkflowSources): void {
    const expectedFiles = ["main.yaml", "release-artifact-rehearsal.yaml", "release.yaml"];
    const actualFiles = [...sources.keys()].sort();
    if (canonicalJson(actualFiles) !== canonicalJson(expectedFiles)) {
      throw new Error(`unexpected workflow file set: ${actualFiles.join(", ")}`);
    }

    const actions: string[] = [];
    const oidc: string[] = [];
    const ordinaryPublishers: string[] = [];
    const recoveryPublishers: string[] = [];
    const directPublishes: string[] = [];
    const releasePushes: string[] = [];
    let proofJob: WorkflowRecord | undefined;

    const inspectPermissions = (
      permissionsValue: unknown,
      location: string,
    ) => {
      const permissions = workflowRecord(permissionsValue, `${location} permissions`);
      for (const [permission, access] of Object.entries(permissions)) {
        if (typeof access !== "string") throw new Error(`${location} permission ${permission} must be a string`);
        if (permission.toLowerCase() === "id-token" && access.toLowerCase() === "write") {
          oidc.push(location);
          if (location !== "release.yaml#publish" && location !== "release.yaml#recover") {
            throw new Error(`${location} may not grant id-token: write`);
          }
        }
      }
    };

    const inspectUses = (usesValue: unknown, location: string) => {
      if (typeof usesValue !== "string") throw new Error(`${location} uses must be a string`);
      if (!/^[^@\s]+\/[^@\s]+@[0-9a-f]{40}$/.test(usesValue)) {
        throw new Error(`${location} action must use an exact lowercase 40-hex commit`);
      }
      actions.push(`${location}:${usesValue}`);
    };

    for (const [filename, source] of sources) {
      const root = workflowRecord(Bun.YAML.parse(source), `${filename} root`);
      assertNoLegacyAuthIndicators(root, filename);

      const rootPermissions = normalizedProperty(root, "permissions", `${filename} root`);
      if (rootPermissions === undefined) throw new Error(`${filename} root permissions are required`);
      inspectPermissions(rootPermissions, `${filename}#workflow`);

      const jobsValue = normalizedProperty(root, "jobs", `${filename} root`);
      const jobs = workflowRecord(jobsValue, `${filename} jobs`);
      for (const [jobId, jobValue] of Object.entries(jobs)) {
        const location = `${filename}#${jobId}`;
        const job = workflowRecord(jobValue, `${location} job`);
        if (location === "release.yaml#artifact-proof") proofJob = job;

        const permissions = normalizedProperty(job, "permissions", `${location} job`);
        if (permissions !== undefined) inspectPermissions(permissions, location);

        const jobUses = normalizedProperty(job, "uses", `${location} job`);
        if (jobUses !== undefined) inspectUses(jobUses, `${location} job`);

        const stepsValue = normalizedProperty(job, "steps", `${location} job`);
        if (!Array.isArray(stepsValue)) throw new Error(`${location} steps must be an array`);
        stepsValue.forEach((stepValue, index) => {
          const stepLocation = `${location} step ${index + 1}`;
          const step = workflowRecord(stepValue, stepLocation);
          const uses = normalizedProperty(step, "uses", stepLocation);
          if (uses !== undefined) inspectUses(uses, stepLocation);
          const run = normalizedProperty(step, "run", stepLocation);
          if (run === undefined) return;
          if (typeof run !== "string") throw new Error(`${stepLocation} run must be a string`);

          const entrypoints = publisherEntrypoints(run);
          if (entrypoints.ordinary) {
            ordinaryPublishers.push(location);
            if (location !== "release.yaml#publish") throw new Error(`${location} may not publish a prepared bundle`);
          }
          if (entrypoints.recovery) {
            recoveryPublishers.push(location);
            if (location !== "release.yaml#recover") throw new Error(`${location} may not recover a bundle`);
          }
          if (shellInvokes(run, "npm", "publish")) {
            directPublishes.push(location);
            if (location !== "release.yaml#publish" && location !== "release.yaml#recover") {
              throw new Error(`${location} may not invoke npm publish`);
            }
          }
          if (shellInvokes(run, "git", "push")) {
            releasePushes.push(location);
            if (location !== "release.yaml#publish" && location !== "release.yaml#recover") {
              throw new Error(`${location} may not push release state`);
            }
          }
        });
      }
    }

    const expectLocations = (actual: string[], expected: string[], label: string) => {
      if (canonicalJson(actual) !== canonicalJson(expected)) {
        throw new Error(`${label} locations differ: ${actual.join(", ")}`);
      }
    };
    if (actions.length !== 21) throw new Error(`expected exactly 21 pinned actions, found ${actions.length}`);
    expectLocations(oidc, ["release.yaml#publish", "release.yaml#recover"], "OIDC");
    expectLocations(ordinaryPublishers, ["release.yaml#publish"], "ordinary publisher");
    expectLocations(recoveryPublishers, ["release.yaml#recover"], "recovery publisher");
    expectLocations(directPublishes, [], "direct npm publish");
    expectLocations(releasePushes, ["release.yaml#publish", "release.yaml#recover"], "release push");

    if (!proofJob) throw new Error("release.yaml#artifact-proof is required");
    const proofPermissions = workflowRecord(
      normalizedProperty(proofJob, "permissions", "release.yaml#artifact-proof"),
      "release.yaml#artifact-proof permissions",
    );
    if (proofPermissions.actions !== "read" || proofPermissions.contents !== "read") {
      throw new Error("artifact-proof must retain exact read-only permissions");
    }
    if (normalizedProperty(proofJob, "environment", "release.yaml#artifact-proof") !== undefined) {
      throw new Error("artifact-proof may not use an environment");
    }
    const proofSteps = normalizedProperty(proofJob, "steps", "release.yaml#artifact-proof") as unknown[];
    if (proofSteps.some((step) => {
      const object = workflowRecord(step, "release.yaml#artifact-proof step");
      const uses = normalizedProperty(object, "uses", "release.yaml#artifact-proof step");
      return typeof uses === "string" && uses.toLowerCase().startsWith("actions/checkout@");
    })) throw new Error("artifact-proof may not check out source");
  }

  function currentWorkflowSources(): WorkflowSources {
    return new Map(workflowFiles.map((name) => [name, readFileSync(join(workflows, name), "utf8")]));
  }

  function withAppendedJob(
    sources: WorkflowSources,
    workflow: string,
    job: string,
  ): WorkflowSources {
    const changed = new Map(sources);
    changed.set(workflow, `${changed.get(workflow)!.trimEnd()}\n${job}\n`);
    return changed;
  }

  function replaceWorkflow(
    sources: WorkflowSources,
    workflow: string,
    transform: (source: string) => string,
  ): WorkflowSources {
    const changed = new Map(sources);
    changed.set(workflow, transform(changed.get(workflow)!));
    return changed;
  }

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

  test("repository-wide workflow scan enforces the exclusive auth and mutation boundary", () => {
    expect(workflowFiles).toEqual([
      "main.yaml",
      "release-artifact-rehearsal.yaml",
      "release.yaml",
    ]);
    assertWorkflowBoundary(currentWorkflowSources());
  });

  test.each([
    [
      "quoted workflow-level OIDC permission",
      () => replaceWorkflow(currentWorkflowSources(), "main.yaml", (source) => source.replace(
        "permissions:\n  contents: read\n",
        "permissions:\n  contents: read\n  \"id-token\" : \"write\"\n",
      )),
    ],
    [
      "quoted and spacing-equivalent OIDC permission",
      () => withAppendedJob(currentWorkflowSources(), "main.yaml", `  quoted-oidc:
    permissions:
      "id-token" : "write"
    runs-on: ubuntu-22.04
    steps:
      - run: echo quoted-oidc`),
    ],
    [
      "quoted mutable action reference",
      () => withAppendedJob(currentWorkflowSources(), "main.yaml", `  mutable-action:
    runs-on: ubuntu-22.04
    steps:
      - "uses" : "actions/checkout@v4"`),
    ],
    [
      "case-varied legacy npm auth and config indicators",
      () => withAppendedJob(currentWorkflowSources(), "main.yaml", `  legacy-auth:
    runs-on: ubuntu-22.04
    env:
      nPm_ToKeN: sentinel
      NpM_CoNfIg_ReGiStRy: https://registry.example.test
    steps:
      - run: printf sentinel > .NPMRC && echo _AUTHTOKEN`),
    ],
    [
      "direct npm publication",
      () => withAppendedJob(currentWorkflowSources(), "main.yaml", `  direct-publish:
    runs-on: ubuntu-22.04
    steps:
      - run: npm --registry https://registry.example.test publish exact.tgz`),
    ],
    [
      "git options before release-state push",
      () => withAppendedJob(currentWorkflowSources(), "main.yaml", `  option-push:
    runs-on: ubuntu-22.04
    steps:
      - run: git -C /work push origin HEAD:refs/heads/v-next`),
    ],
    [
      "ordinary publisher entry point moved into an unauthorized job",
      () => replaceWorkflow(currentWorkflowSources(), "release.yaml", (source) => source
        .replace(
          "          bun run .github/publish-bun.effectstream.ts --publish-bundle --publish \\\n",
          "          echo 'publication delegated to the next job'\n",
        )
        .replace(
          "  artifact-proof:\n",
          `  ordinary-backdoor:
    runs-on: ubuntu-22.04
    steps:
      - run: bun run .github/publish-bun.effectstream.ts --publish-bundle --publish

  artifact-proof:
`,
        )),
    ],
    [
      "recovery entry point moved into a job appended after recover",
      () => withAppendedJob(
        replaceWorkflow(currentWorkflowSources(), "release.yaml", (source) => source.replace(
          "          bun run .github/publish-bun.effectstream.ts --recover-bundle --publish \\\n",
          "          echo 'recovery delegated to the appended job'\n",
        )),
        "release.yaml",
        `  recovery-backdoor:
    runs-on: ubuntu-22.04
    steps:
      - run: bun run .github/publish-bun.effectstream.ts --recover-bundle --publish`,
      ),
    ],
    [
      "quoted publisher path and flags in an appended unauthorized job",
      () => withAppendedJob(currentWorkflowSources(), "release.yaml", `  quoted-publisher-backdoor:
    runs-on: ubuntu-22.04
    steps:
      - run: bun run ".github/publish-bun.effectstream.ts" "--publish-bundle" "--publish"`),
    ],
    [
      "non-object workflow root",
      () => replaceWorkflow(currentWorkflowSources(), "main.yaml", () => "- jobs\n- steps\n"),
    ],
    [
      "non-object jobs collection",
      () => replaceWorkflow(currentWorkflowSources(), "main.yaml", () => "permissions: {}\njobs: []\n"),
    ],
    [
      "non-object job definition",
      () => replaceWorkflow(currentWorkflowSources(), "main.yaml", () => "permissions: {}\njobs:\n  malformed: scalar\n"),
    ],
    [
      "non-object permissions",
      () => replaceWorkflow(currentWorkflowSources(), "main.yaml", () => "permissions: []\njobs:\n  malformed:\n    steps: []\n"),
    ],
    [
      "non-array steps",
      () => replaceWorkflow(currentWorkflowSources(), "main.yaml", () => "permissions: {}\njobs:\n  malformed:\n    steps: {}\n"),
    ],
    [
      "non-string uses",
      () => replaceWorkflow(currentWorkflowSources(), "main.yaml", () => "permissions: {}\njobs:\n  malformed:\n    steps:\n      - \"uses\": []\n"),
    ],
    [
      "non-string run",
      () => replaceWorkflow(currentWorkflowSources(), "main.yaml", () => "permissions: {}\njobs:\n  malformed:\n    steps:\n      - run: []\n"),
    ],
  ] as const)("structural oracle rejects %s", (_name, fixture) => {
    const sources = fixture();
    expect(currentLiteralBoundaryViolations(sources)).toEqual([]);
    expect(() => assertWorkflowBoundary(sources)).toThrow();
  });

  test("structural oracle accepts a quoted spacing-equivalent immutable action", () => {
    const pinned = "actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1";
    const sources = replaceWorkflow(currentWorkflowSources(), "main.yaml", (source) => source.replace(
      `uses: ${pinned}`,
      `"uses" : "${pinned}"`,
    ));
    expect(currentLiteralBoundaryViolations(sources)).toEqual([]);
    expect(() => assertWorkflowBoundary(sources)).not.toThrow();
  });

  test.each([
    "pu",
    "pub",
    "publ",
    "publi",
    "publis",
    "publish",
  ] as const)("structural oracle rejects npm 11.19.0 publish spelling %s", (spelling) => {
    const sources = withAppendedJob(currentWorkflowSources(), "main.yaml", `  npm-${spelling}-backdoor:
    runs-on: ubuntu-22.04
    steps:
      - run: npm ${spelling} exact.tgz`);
    expect(currentLiteralBoundaryViolations(sources)).toEqual([]);
    expect(() => assertWorkflowBoundary(sources)).toThrow();
  });

  test("structural oracle rejects an option-prefixed npm 11.19.0 publish alias", () => {
    const sources = withAppendedJob(currentWorkflowSources(), "main.yaml", `  npm-option-alias-backdoor:
    runs-on: ubuntu-22.04
    steps:
      - run: npm --registry https://registry.example.test pub exact.tgz`);
    expect(currentLiteralBoundaryViolations(sources)).toEqual([]);
    expect(() => assertWorkflowBoundary(sources)).toThrow();
  });

  test("structural oracle accepts npm p as a non-publication control", () => {
    const sources = withAppendedJob(currentWorkflowSources(), "main.yaml", `  npm-p-control:
    runs-on: ubuntu-22.04
    steps:
      - run: npm p exact.tgz`);
    expect(currentLiteralBoundaryViolations(sources)).toEqual([]);
    expect(() => assertWorkflowBoundary(sources)).not.toThrow();
  });

  test.each([
    ["absolute npm command path", "/usr/local/bin/npm pu exact.tgz"],
    ["quoted npm command path and alias", `"/usr/local/bin/npm" "publi" exact.tgz`],
    ["continued npm command and options", `npm \\
          --registry https://registry.example.test \\
          publis exact.tgz`],
  ] as const)("structural oracle preserves %s alias rejection", (label, run) => {
    const jobId = label.replaceAll(" ", "-");
    const sources = withAppendedJob(currentWorkflowSources(), "main.yaml", `  ${jobId}:
    runs-on: ubuntu-22.04
    steps:
      - run: |
          ${run}`);
    expect(() => assertWorkflowBoundary(sources)).toThrow();
  });

  test("ci-ok binds every result and event discriminator through inert environment values", () => {
    const ciOk = jobBlock(main, "ci-ok");
    for (const binding of [
      "EVENT_NAME: ${{ github.event_name }}",
      "PR_DRAFT: ${{ github.event.pull_request.draft || false }}",
      "CHANGES_RESULT: ${{ needs.changes.result }}",
      "E2E_RESULT: ${{ needs.e2e.result }}",
      "TEMPLATE_TESTS_RESULT: ${{ needs.template-tests.result }}",
      "FRONTEND_BUILD_RESULT: ${{ needs.frontend-build.result }}",
      "ASSETS_CHECK_RESULT: ${{ needs.assets-check.result }}",
      "RELEASE_TESTS_RESULT: ${{ needs.release-tests.result }}",
    ]) expect(ciOk).toContain(binding);
    expect(stepRun(main, "Verify required jobs")).not.toContain("${{");
  });

  test("ci-ok executable truth table rejects unexpected skip, cancel, and failure states", () => {
    const script = stepRun(main, "Verify required jobs");
    const base = {
      PATH: process.env.PATH!,
      EVENT_NAME: "push",
      PR_DRAFT: "false",
      CHANGES_RESULT: "success",
      E2E_RESULT: "skipped",
      TEMPLATE_TESTS_RESULT: "skipped",
      FRONTEND_BUILD_RESULT: "skipped",
      ASSETS_CHECK_RESULT: "success",
      RELEASE_TESTS_RESULT: "success",
    };
    const run = (overrides: Record<string, string>) => Bun.spawnSync(
      ["bash", "-c", script],
      { env: { ...base, ...overrides } },
    ).exitCode;

    expect(run({})).toBe(0);
    expect(run({ EVENT_NAME: "pull_request", PR_DRAFT: "false" })).toBe(0);
    expect(run({ EVENT_NAME: "pull_request", PR_DRAFT: "true", RELEASE_TESTS_RESULT: "skipped" })).toBe(0);
    for (const result of ["failure", "cancelled", "skipped"]) {
      expect(run({ CHANGES_RESULT: result })).not.toBe(0);
    }
    for (const result of ["failure", "cancelled", "skipped"]) {
      expect(run({ RELEASE_TESTS_RESULT: result })).not.toBe(0);
      expect(run({ EVENT_NAME: "pull_request", PR_DRAFT: "false", RELEASE_TESTS_RESULT: result })).not.toBe(0);
    }
    expect(run({ EVENT_NAME: "pull_request", PR_DRAFT: "true", RELEASE_TESTS_RESULT: "success" })).not.toBe(0);
    expect(run({ ASSETS_CHECK_RESULT: "skipped" })).not.toBe(0);
    expect(run({ E2E_RESULT: "cancelled" })).not.toBe(0);
    expect(run({ EVENT_NAME: "workflow_dispatch" })).not.toBe(0);
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
    expect(main).toContain("RELEASE_TESTS_RESULT: ${{ needs.release-tests.result }}");
    expect(main).toContain('echo "release-tests=$RELEASE_TESTS_RESULT"');
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
