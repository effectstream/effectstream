import type { ProcessConfig } from "./config.ts";
import { readStatePort, DEFAULT_API_PORT } from "./port-check.ts";

export { DEFAULT_API_PORT };

export type RemoteProcess = {
  name: string;
  pid: number | null;
  ports: number[];
  status: string;
  startedAt: string | null;
  endedAt: string | null;
  exitCode: number | null;
  link: string | null;
  critical: boolean;
  description: string | null;
  logFile: string | null;
};

export class OrchestratorClient {
  private baseUrl: string;

  constructor(port?: number) {
    const p = port ?? readStatePort() ?? DEFAULT_API_PORT;
    this.baseUrl = `http://localhost:${p}`;
  }

  async isRunning(): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/health`, {
        signal: AbortSignal.timeout(1000),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  async getProcesses(): Promise<RemoteProcess[]> {
    const res = await fetch(`${this.baseUrl}/processes`);
    if (!res.ok) throw new Error(`API error ${res.status}`);
    const body = (await res.json()) as { processes: RemoteProcess[] };
    return body.processes;
  }

  async restart(name: string): Promise<{ success: boolean; error?: string }> {
    const res = await fetch(`${this.baseUrl}/restart`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    return res.json() as Promise<{ success: boolean; error?: string }>;
  }

  async stop(name?: string): Promise<{ success: boolean; error?: string }> {
    const res = await fetch(`${this.baseUrl}/stop`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    return res.json() as Promise<{ success: boolean; error?: string }>;
  }

  async start(processes: ProcessConfig[], opts?: { only?: string[]; except?: string[]; serial?: boolean; noDeps?: boolean }): Promise<{ success: boolean; queued?: string[]; error?: string }> {
    const res = await fetch(`${this.baseUrl}/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ processes, only: opts?.only, except: opts?.except, serial: opts?.serial, noDeps: opts?.noDeps }),
    });
    return res.json() as Promise<{ success: boolean; queued?: string[]; error?: string }>;
  }

  async silence(names: string[], unsilence = false): Promise<{ success: boolean; silenced?: string[]; error?: string }> {
    const res = await fetch(`${this.baseUrl}/silence`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ names, unsilence }),
    });
    return res.json() as Promise<{ success: boolean; silenced?: string[]; error?: string }>;
  }

  async getSilenced(): Promise<string[]> {
    const res = await fetch(`${this.baseUrl}/silence`);
    if (!res.ok) throw new Error(`API error ${res.status}`);
    const body = (await res.json()) as { silenced: string[] };
    return body.silenced;
  }

  async shutdown(): Promise<void> {
    await fetch(`${this.baseUrl}/shutdown`, { method: "POST" }).catch(() => {});
  }
}
