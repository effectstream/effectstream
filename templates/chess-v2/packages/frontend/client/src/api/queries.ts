import { EFFECTSTREAM_NODE_URL } from "../config.ts";

async function get<T>(path: string, params?: Record<string, string | number>): Promise<T> {
  const url = new URL(path, EFFECTSTREAM_NODE_URL);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, String(v));
    }
  }
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

export async function getLobbyState(lobbyID: string) {
  return get<{ lobby: any }>("/api/lobby_state", { lobbyID });
}

export async function getOpenLobbies(wallet: string, page = 0, count = 10) {
  return get<{ lobbies: any[] }>("/api/open_lobbies", { wallet, page, count });
}

export async function searchOpenLobbies(wallet: string, searchQuery: string, page = 0, count = 10) {
  return get<{ lobbies: any[] }>("/api/search_open_lobbies", { wallet, searchQuery, page, count });
}

export async function getUserLobbies(wallet: string, page = 0, count = 10) {
  return get<{ lobbies: any[] }>("/api/user_lobbies", { wallet, page, count });
}

export async function getUserStats(wallet: string) {
  return get<{ stats: any; rank: string | undefined }>("/api/user_stats", { wallet });
}

export async function getMatchWinner(lobbyID: string) {
  return get<{ result: any }>("/api/match_winner", { lobbyID });
}

export async function getRoundStatus(lobbyID: string, round: number) {
  return get<{ round: any; moves: any[] }>("/api/round_status", { lobbyID, round });
}

export async function getRoundExecutor(lobbyID: string, round: number) {
  return get<{ lobby: any; round: any; moves: any[] }>("/api/round_executor", { lobbyID, round });
}

export async function getMatchExecutor(lobbyID: string) {
  return get<{ lobby: any; rounds: any[]; moves: any[]; seeds: any[] }>("/api/match_executor", { lobbyID });
}

export async function getRandomLobby() {
  return get<{ lobby: any }>("/api/random_lobby");
}

export async function getRandomActiveLobby() {
  return get<{ lobby: any }>("/api/random_active_lobby");
}
