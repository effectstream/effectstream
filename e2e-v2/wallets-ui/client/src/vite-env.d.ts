/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_EFFECTSTREAM_ENV: string;
  readonly VITE_BATCHER_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
