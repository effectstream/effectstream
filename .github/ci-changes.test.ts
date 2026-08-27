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
  });
});
