/// <reference types="vite/client" />

interface ViteTypeOptions {
    // By adding this line, you can make the type of ImportMetaEnv strict
    // to disallow unknown keys.
    strictImportMetaEnv: unknown
  }
  
  interface ImportMetaEnv {
    readonly VITE_EFFECTSTREAM_API_PORT: string
    readonly VITE_BATCHER_PORT: string
    readonly VITE_DOCS_PORT: string
    readonly VITE_EFFECTSTREAM_EXPLORER_PORT: string
    readonly VITE_API_KEY_OPEN_ENDPOINTS_EXPLORER: string
  }
  
  interface ImportMeta {
    readonly env: ImportMetaEnv
  }