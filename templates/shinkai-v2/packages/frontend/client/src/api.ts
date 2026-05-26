const API_BASE = import.meta.env.VITE_API_URL ?? "http://localhost:9999";

export async function getGame(gameId: number) {
  const res = await fetch(`${API_BASE}/api/game?game_id=${gameId}`);
  return (await res.json()).stats;
}

export async function getNewGame(wallet: string) {
  const res = await fetch(`${API_BASE}/api/game/new?wallet=${wallet}`);
  return (await res.json()).stats;
}

export async function getGameRound(gameId: number, stage: string) {
  const res = await fetch(`${API_BASE}/api/game/round?game_id=${gameId}&stage=${stage}`);
  return (await res.json()).stats;
}

export async function getTokens(wallet: string) {
  const res = await fetch(`${API_BASE}/api/game/tokens?wallet=${wallet}`);
  return (await res.json()).stats;
}
