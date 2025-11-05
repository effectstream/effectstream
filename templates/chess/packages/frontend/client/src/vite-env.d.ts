/// <reference types="vite/client" />

interface ViteTypeOptions {
  // By adding this line, you can make the type of ImportMetaEnv strict
  // to disallow unknown keys.
  // strictImportMetaEnv: unknown
}

interface ImportMetaEnv {
  readonly VITE_EFFECTSTREAM_NODE_URL: string;
  readonly VITE_BATCHER_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
