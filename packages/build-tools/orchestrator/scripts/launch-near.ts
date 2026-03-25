import { ComponentNames } from "@effectstream/log";

// Start NEAR sandbox node.
//
// This launcher expects the @effectstream/near-sandbox package to provide an entry
// point that bootstraps neard in sandbox mode.
//
// packageName: the npm package that should be launched through bun.
//
export const launchNear = (packageName: string): {
  stopProcessAtPort?: number[];
  name: string;
  args: string[];
  waitToExit?: boolean;
  logs?: string;
  logsStartDisabled?: boolean;
  disableStderr?: boolean;
  type?: string;
  dependsOn?: string[];
}[] => [
  {
    stopProcessAtPort: [3030],
    name: ComponentNames.NEAR_SANDBOX,
    args: ["run", "--filter", packageName, "chain:start"],
    waitToExit: false,
    logs: "raw",
    logsStartDisabled: true,
    type: "system-dependency",
  },
  {
    name: ComponentNames.NEAR_SANDBOX_WAIT,
    args: ["run", "--filter", packageName, "chain:wait"],
    waitToExit: true,
    type: "system-dependency",
    dependsOn: [ComponentNames.NEAR_SANDBOX],
  },
];
