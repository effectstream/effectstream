// Frontend runtime config.

import { DEFAULT_FAUCET_URL, DEFAULT_MIDNIGHT_NETWORK_ID } from './faucetUrl';
import { resolveTokenMetadataConfig } from './services/tokenMetadata';
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

export const MIDNIGHT_NETWORK_ID =
  (import.meta.env.VITE_MIDNIGHT_NETWORK_ID as string | undefined)?.trim() ||
  DEFAULT_MIDNIGHT_NETWORK_ID;

const runtimeMetadata = window as unknown as {
  TOKEN_METADATA_API_BASE?: string;
  TOKEN_METADATA_NETWORK_ID?: string;
};

/**
 * Optional issuer metadata. Both values are required and the network must
 * match this Offer Files build; otherwise indexed names are disabled.
 */
export const TOKEN_METADATA_CONFIG = resolveTokenMetadataConfig(
  runtimeMetadata.TOKEN_METADATA_API_BASE ??
    (import.meta.env.VITE_TOKEN_METADATA_API_BASE as string | undefined),
  runtimeMetadata.TOKEN_METADATA_NETWORK_ID ??
    (import.meta.env.VITE_TOKEN_METADATA_NETWORK_ID as string | undefined),
  MIDNIGHT_NETWORK_ID,
  location.origin,
);

export const FAUCET_BASE_URL =
  (import.meta.env.VITE_FAUCET_URL as string | undefined)?.trim() ||
  DEFAULT_FAUCET_URL;
