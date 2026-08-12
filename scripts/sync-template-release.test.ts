import { describe, expect, test } from "bun:test";
import {
  synchronizeDependencyValue,
  synchronizePackageJson,
} from "./sync-template-release.ts";

const publishable = new Set(["@effectstream/runtime", "@effectstream/config"]);

describe("template release synchronization", () => {
  test("updates every supported dependency section", () => {
    const input = {
      dependencies: { "@effectstream/runtime": "*" },
      devDependencies: { "@effectstream/config": "^1.0.0" },
      peerDependencies: { "@effectstream/runtime": "1.0.0" },
      optionalDependencies: { "@effectstream/config": "latest" },
      overrides: { "@effectstream/runtime": "~1.0.0" },
      resolutions: { "@effectstream/config": "1.0.0" },
    };
    const result = synchronizePackageJson(input, "2.3.4", publishable);
    expect(result.changed).toBe(true);
    for (const section of Object.keys(input)) {
      expect(Object.values(result.pkg[section])).toEqual(["2.3.4"]);
    }
  });

  test("updates npm aliases without changing the alias package", () => {
    expect(synchronizeDependencyValue(
      "runtime-alias",
      "npm:@effectstream/runtime@1.0.0",
      "2.3.4",
      publishable,
    )).toBe("npm:@effectstream/runtime@2.3.4");
  });

  test("leaves template workspaces and unrelated packages unchanged", () => {
    const input = {
      dependencies: {
        "@template/local": "workspace:*",
        react: "19.1.0",
      },
    };
    expect(synchronizePackageJson(input, "2.3.4", publishable)).toEqual({
      pkg: input,
      changed: false,
    });
  });

  test("is idempotent after synchronization", () => {
    const first = synchronizePackageJson(
      { dependencies: { "@effectstream/runtime": "1.0.0" } },
      "2.3.4",
      publishable,
    );
    expect(synchronizePackageJson(first.pkg, "2.3.4", publishable).changed).toBe(false);
  });
});
