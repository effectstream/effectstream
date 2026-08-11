import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

import { classify } from "/effectstream/.github/ci-changes.ts";
import { DOCKER_MANAGED, ENABLED } from "/effectstream/templates/run-template-tests.ts";

const template = "midnight-stagenet-v2";

describe("Midnight v2 CI registration", () => {
  test("classifies the template while keeping it Docker-managed", () => {
    expect(ENABLED).toContain(template);
    expect(DOCKER_MANAGED.has(template)).toBe(true);
    expect(classify([`templates/${template}/packages/node/src/config.ts`], ENABLED)).toEqual({
      core: false,
      templates: [template],
    });
    expect(classify(["packages/node-sdk/sync/src/example.ts"], ENABLED).core).toBe(true);
  });

  test("keeps deterministic and live jobs on separate trust boundaries", () => {
    const main = readFileSync("/effectstream/.github/workflows/main.yaml", "utf8");
    const live = readFileSync(
      "/effectstream/.github/workflows/midnight-stagenet-v2-live.yaml",
      "utf8",
    );
    expect(Bun.YAML.parse(main)).toBeObject();
    expect(Bun.YAML.parse(live)).toBeObject();
    expect(main).toContain("midnight-v2-hermetic:");
    expect(main).toContain("--skip-docker-managed");
    expect(main).toContain("--profile hermetic up --build --abort-on-container-exit");
    expect(live).toContain("schedule:");
    expect(live).toContain("workflow_dispatch:");
    expect(live).toContain("github.event_name == 'workflow_dispatch' && inputs.run_write");
    expect(live).toContain("secrets.MIDNIGHT_V2_STAGENET_WALLET_SEED");
    expect(live).not.toContain("pull_request_target");
  });
});
