// Examples for the README — verify the public surface resolves.

import { test, expect } from "bun:test";
import type { OrchestratorConfig, ProcessConfig } from "../src/config.ts";

test("README: OrchestratorConfig + ProcessConfig types compose into a valid object", () => {
  const config: OrchestratorConfig = {
    processes: [
      {
        name: "pglite",
        command: ["bun", "run", "@effectstream/db/start-pglite"],
        readiness: { tcp: { port: 5432 } },
      },
      {
        name: "hardhat",
        command: ["bun", "run", "hardhat", "node"],
        readiness: { http: { url: "http://127.0.0.1:8545" } },
      },
      {
        name: "deploy-contracts",
        command: ["bun", "scripts/deploy.ts"],
        dependsOn: ["hardhat"],
      },
    ],
  };

  expect(config.processes.length).toBe(3);
  expect(config.processes[0].name).toBe("pglite");

  const proc: ProcessConfig = config.processes[1];
  expect(proc.name).toBe("hardhat");
});
