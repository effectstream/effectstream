import type { TickEvent } from "@chess/game-logic";
import { format } from "date-fns";
import { BLOCK_TIME } from "./constants";

export const formatDate = (dateISO: string | Date): string => {
  const date = new Date(dateISO);
  return format(date, "yyyy-MM-dd, HH:mm:ss");
};

export const formatTime = (time: number): string => {
  const seconds = time % 60;
  const minutes = Math.floor(time / 60) % 60;
  const hours = Math.floor(time / 3600);

  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(
    2,
    "0",
  )}:${String(seconds).padStart(2, "0")}`;
};

export function isTickEvent(event: any): event is TickEvent {
  return (event as TickEvent).pgn_move !== undefined;
}

export function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export const formatPlayer = (address: string): string => {
  if (!address) return "WAITING...";
  if (address.length < 10) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
};

/**
 * @returns human readable time from blocks in format "1h 30m" (either component omitted if 0)
 */
export const blocksToTime = (blocks: number): string => {
  const seconds = blocks * BLOCK_TIME;
  const minutes = Math.floor(seconds / 60) % 60;
  const hours = Math.floor(seconds / 3600);

  if (hours === 0) return `${minutes}m`;

  if (minutes === 0) return `${hours}h`;

  return `${hours}h ${minutes}m`;
};

export const blocksToSeconds = (blocks: number): number => blocks * BLOCK_TIME;
