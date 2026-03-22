const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function waitForPort(port: number, timeoutMs: number = 30000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const response = await fetch(`http://localhost:${port}`);
      if (response) return;
    } catch {
      await delay(500);
    }
  }
  throw new Error(`Timeout waiting for port ${port}`);
}

export async function waitForHealth(
  url: string,
  timeoutMs: number = 60000,
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        const data = await response.json();
        if (data.status === "ok") return;
      }
    } catch {
      // not ready
    }
    await delay(500);
  }
  throw new Error(`Timeout waiting for health at ${url}`);
}

export async function waitForRpcReady(
  rpcUrl: string,
  timeoutMs: number = 30000,
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const response = await fetch(rpcUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "eth_blockNumber",
          params: [],
        }),
      });
      if (response.ok) {
        const json = await response.json();
        if (json.result) return;
      }
    } catch {
      // not ready
    }
    await delay(500);
  }
  throw new Error(`Timeout waiting for RPC at ${rpcUrl}`);
}

export async function waitForBlockHeight(
  rpcUrl: string,
  targetBlock: number,
  timeoutMs: number = 60000,
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const response = await fetch(rpcUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "eth_blockNumber",
          params: [],
        }),
      });
      if (response.ok) {
        const json = await response.json();
        if (json.result) {
          const blockHeight = parseInt(json.result, 16);
          if (blockHeight >= targetBlock) return;
        }
      }
    } catch {
      // not ready
    }
    await delay(500);
  }
  throw new Error(`Timeout waiting for block ${targetBlock} at ${rpcUrl}`);
}

export async function waitForSyncReady(
  apiPort: number,
  timeoutMs: number = 60000,
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const healthResponse = await fetch(
        `http://localhost:${apiPort}/health`,
      );
      const data = await healthResponse.json();
      if (data.status === "ok") return;
    } catch {
      // not ready
    }
    await delay(500);
  }
  throw new Error(`Timeout waiting for sync service to be ready on port ${apiPort}`);
}

export async function waitForOrchestratorProcess(
  orchestratorPort: number,
  processName: string,
  timeoutMs: number = 120000,
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const response = await fetch(
        `http://localhost:${orchestratorPort}/processes`,
      );
      const json = await response.json();
      if (json.processes?.find((p: any) => p.name === processName)) {
        return;
      }
    } catch {
      // not ready
    }
    await delay(500);
  }
  throw new Error(`Timeout waiting for process "${processName}" on orchestrator port ${orchestratorPort}`);
}
