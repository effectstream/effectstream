// Frontend runtime config.
//
// Resolution order for the backend API base URL:
//   1. `window.API_BASE` — set by the hosting page before the bundle loads
//      (useful for production deployments behind a proxy).
//   2. `VITE_API_BASE` — Vite env var, baked in at build time.
//   3. `http://<hostname>:9999` — dev default matching the backend's default
//      EFFECTSTREAM_API_PORT.
const windowBase = (window as unknown as { API_BASE?: string }).API_BASE;
const envBase = import.meta.env.VITE_API_BASE as string | undefined;

export const API_BASE =
  windowBase ?? envBase ?? `http://${location.hostname}:9999`;

const windowBatcher = (window as unknown as { BATCHER_URL?: string }).BATCHER_URL;
const envBatcher = import.meta.env.VITE_BATCHER_URL as string | undefined;

export const BATCHER_URL =
  windowBatcher ?? envBatcher ?? `http://${location.hostname}:3334`;

export const BATCHER_TARGET =
  (import.meta.env.VITE_BATCHER_TARGET as string | undefined) ?? 'midnight-balancer';
