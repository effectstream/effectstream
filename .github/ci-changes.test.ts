import { describe, expect, test } from "bun:test";
import {
  classify,
  baseIsUnusable,
  diffArgs,
  parseLongLivedBranches,
} from "./ci-changes.ts";

// A fixed enabled set so these assertions don't shift as templates are
// enabled/disabled in run-template-tests.ts.
const ENABLED = ["preorder", "evm-cardano", "world-map-2d"];

describe("classify — core", () => {
  test("packages/** triggers core", () => {
    expect(classify(["packages/node-sdk/sync/src/foo.ts"], ENABLED).core).toBe(true);
  });

  test("e2e/** triggers core", () => {
    expect(classify(["e2e/runner.ts"], ENABLED).core).toBe(true);
  });

  test("e2e build-infra files trigger core", () => {
    for (const f of [
      ".github/Dockerfile",
      ".github/run-e2e.sh",
      "patch.sh",
      "bun.lock",
      "package.json",
      "tsconfig.json",
      "orchestrator.config.ts",
      ".github/workflows/main.yaml",
      ".github/ci-changes.ts",
    ]) {
      expect(classify([f], ENABLED).core).toBe(true);
    }
  });

  test("template-only and doc-only changes do not trigger core", () => {
    expect(classify(["templates/preorder/packages/node/main.ts"], ENABLED).core).toBe(false);
    expect(classify(["templates/check.sh"], ENABLED).core).toBe(false);
    expect(classify(["README.md", "docs/site/foo.md"], ENABLED).core).toBe(false);
  });
});

describe("classify — templates", () => {
  test("an enabled template dir change is collected", () => {
    expect(classify(["templates/preorder/packages/node/main.ts"], ENABLED).templates).toEqual([
      "preorder",
    ]);
  });

  test("a disabled/unknown template dir change is ignored", () => {
    expect(classify(["templates/dice/x.ts"], ENABLED).templates).toEqual([]);
    expect(classify(["templates/not-a-real-template/x.ts"], ENABLED).templates).toEqual([]);
  });

  test("top-level files under templates/ are not templates", () => {
    const r = classify(
      [
        "templates/run-template-tests.ts",
        "templates/check.sh",
        "templates/AGENTS.md",
        "templates/update-packages.ts",
      ],
      ENABLED,
    );
    expect(r.templates).toEqual([]);
    expect(r.core).toBe(false);
  });

  test("multiple enabled templates are deduped and sorted", () => {
    const r = classify(
      [
        "templates/world-map-2d/a.ts",
        "templates/preorder/b.ts",
        "templates/preorder/c.ts",
      ],
      ENABLED,
    );
    expect(r.templates).toEqual(["preorder", "world-map-2d"]);
  });
});

describe("classify — single-file template", () => {
  test("a change inside templates/single-file selects the job", () => {
    expect(classify(["templates/single-file/minimal.ts"], ENABLED).singleFile).toBe(true);
    expect(classify(["templates/single-file/package.json"], ENABLED).singleFile).toBe(true);
  });

  test("single-file is NOT collected as an ordinary template", () => {
    // It has no `bun run test` script and is not in ENABLED, so the shared
    // template job would silently skip it — which is exactly why it needs its
    // own flag.
    const r = classify(["templates/single-file/minimal.ts"], ENABLED);
    expect(r.templates).toEqual([]);
    expect(r.core).toBe(false);
    expect(r.singleFile).toBe(true);
  });

  test("supporting files that can break it also select the job", () => {
    for (const f of [
      "templates/test-single-file.ts",
      "templates/update-packages.ts",
      ".github/ci-changes.ts",
      ".github/workflows/main.yaml",
    ]) {
      expect(classify([f], ENABLED).singleFile).toBe(true);
    }
  });

  test("unrelated changes do not select the job", () => {
    for (const f of [
      "templates/preorder/packages/node/main.ts",
      "templates/run-template-tests.ts",
      "templates/check.sh",
      "packages/node-sdk/sync/src/foo.ts",
      "docs/site/foo.md",
      "README.md",
    ]) {
      expect(classify([f], ENABLED).singleFile).toBe(false);
    }
  });

  test("a sibling directory with the same prefix does not match", () => {
    expect(classify(["templates/single-file-extra/x.ts"], ENABLED).singleFile).toBe(false);
  });
});

describe("diffArgs — diff range selection", () => {
  const opts = {
    base: "B",
    head: "H",
    headRef: "feat/x",
    defaultBranch: "v-next",
    longLivedBranches: ["v-next", "midnight-1"],
  };

  test("pull_request uses three-dot base...head (only what the PR adds)", () => {
    expect(diffArgs({ ...opts, eventName: "pull_request" })).toEqual([
      "diff",
      "--name-only",
      "B...H",
    ]);
  });

  test("pull_request merge ref still uses explicit base...head SHAs", () => {
    expect(
      diffArgs({
        ...opts,
        eventName: "pull_request",
        headRef: "123/merge",
      }),
    ).toEqual(["diff", "--name-only", "B...H"]);
  });

  test("push to the default branch uses two-arg before..after", () => {
    expect(
      diffArgs({ ...opts, eventName: "push", headRef: "v-next" }),
    ).toEqual(["diff", "--name-only", "B", "H"]);
  });

  test("push to the maintenance branch uses only before..after", () => {
    expect(
      diffArgs({ ...opts, eventName: "push", headRef: "midnight-1" }),
    ).toEqual(["diff", "--name-only", "B", "H"]);
  });

  test("push to a feature branch diffs the merge-base via FETCH_HEAD, not before", () => {
    // FETCH_HEAD is the freshly-fetched default-branch tip; ...H selects only the
    // branch's own delta, so a merge of the default branch in is excluded.
    expect(diffArgs({ ...opts, eventName: "push" })).toEqual([
      "diff",
      "--name-only",
      "FETCH_HEAD...H",
    ]);
  });
});

describe("initial and rewritten push bases", () => {
  test.each([
    [undefined, true],
    ["", true],
    ["0000000000000000000000000000000000000000", true],
    ["000000", true],
    ["0123456789012345678901234567890123456789", false],
  ])("base %p unusable=%p", (base, expected) => {
    expect(baseIsUnusable(base)).toBe(expected);
  });
});

describe("mainline allowlist", () => {
  test("accepts the exact approved long-lived branches", () => {
    expect(parseLongLivedBranches("v-next,midnight-1")).toEqual([
      "v-next",
      "midnight-1",
    ]);
  });

  test.each([
    undefined,
    "",
    "v-next",
    "v-next,midnight-1,feature/x",
    "v-next,v-next",
    "v-next,midnight-1,",
    "v-next,midnight 1",
  ])("rejects missing or malformed allowlist %p", (value) => {
    expect(parseLongLivedBranches(value)).toBeNull();
  });
});

describe("classify — combined", () => {
  test("packages + an enabled template set both signals", () => {
    const r = classify(
      ["packages/node-sdk/sync/src/foo.ts", "templates/evm-cardano/packages/node/main.ts"],
      ENABLED,
    );
    expect(r.core).toBe(true);
    expect(r.templates).toEqual(["evm-cardano"]);
  });

  test("empty / blank input yields no jobs", () => {
    const r = classify(["", "   "], ENABLED);
    expect(r.core).toBe(false);
    expect(r.templates).toEqual([]);
    expect(r.singleFile).toBe(false);
  });

  test("core, an enabled template and single-file are independent signals", () => {
    const r = classify(
      [
        "packages/node-sdk/sync/src/foo.ts",
        "templates/evm-cardano/packages/node/main.ts",
        "templates/single-file/minimal.ts",
      ],
      ENABLED,
    );
    expect(r.core).toBe(true);
    expect(r.templates).toEqual(["evm-cardano"]);
    expect(r.singleFile).toBe(true);
  });
});
