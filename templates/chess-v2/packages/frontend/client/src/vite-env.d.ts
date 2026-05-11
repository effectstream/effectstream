/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_EFFECTSTREAM_NODE_URL: string;
  readonly VITE_BATCHER_URL: string;
  readonly VITE_IS_BUN: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
