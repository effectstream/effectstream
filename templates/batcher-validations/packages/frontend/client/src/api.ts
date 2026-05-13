const API_BASE = "http://localhost:9999";

export async function getGateStatus(): Promise<boolean> {
  const res = await fetch(`${API_BASE}/api/gate`);
  const data = await res.json();
  return data.accepting;
}

export async function setGateStatus(accepting: boolean): Promise<void> {
  await fetch(`${API_BASE}/api/gate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ accepting }),
  });
}

export interface Command {
  id: number;
  sender: string;
  message: string;
  block_height: number;
  created_at: string;
}

export async function getCommands(): Promise<Command[]> {
  const res = await fetch(`${API_BASE}/api/commands`);
  return res.json();
}
