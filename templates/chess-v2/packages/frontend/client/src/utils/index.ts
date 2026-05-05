import { BLOCK_TIME } from "./constants.ts";

export function blocksToTime(blocks: number): string {
  const seconds = blocks * BLOCK_TIME;
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.round(seconds / 3600)}h`;
  return `${Math.round(seconds / 86400)}d`;
}

export function truncateAddress(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}
