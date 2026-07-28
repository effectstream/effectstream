import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import wasm from 'vite-plugin-wasm'
import nodePolyfills from 'vite-plugin-node-stdlib-browser'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const projectRoot = dirname(fileURLToPath(import.meta.url))
const cryptoShim = resolve(projectRoot, 'src/shims/crypto.ts')

// Vite's SPA fallback serves index.html for any unmatched path, which makes
// requests for missing ZK artifacts return HTML instead of a 404. That breaks
// FetchZkConfigProvider + the proof server (proof server sees HTML, can't
// parse, returns 400). Force a real 404 on /keys/* and /zkir/* when the file
// is not present in public/.
function zkArtifactFourOhFour(): Plugin {
  const publicDir = resolve(projectRoot, 'public')
  const guarded = ['/keys/', '/zkir/']

  const middleware = (req: any, res: any, next: () => void) => {
    const url: string = req.url?.split('?')[0] ?? ''
    if (!guarded.some((prefix) => url.startsWith(prefix))) return next()
    const filePath = resolve(publicDir, '.' + url)
    if (existsSync(filePath)) return next()
    res.statusCode = 404
    res.setHeader('Content-Type', 'text/plain')
    res.end(`ZK artifact not found: ${url}\n`)
  }

  return {
    name: 'zk-artifact-404',
    configureServer(server) {
      server.middlewares.use(middleware)
    },
    configurePreviewServer(server) {
      server.middlewares.use(middleware)
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  define: {
    // Some transitive deps from midnight-js-indexer-public-data-provider
    // (notably @subsquid/scale-codec → util/assert) reference `process` and
    // other Node globals. The wallets-ui reference config does the same.
    Deno: undefined,
    Bun: undefined,
  },
  resolve: {
    alias: [
      // crypto-browserify (used by the node-stdlib-browser polyfill) is
      // missing `timingSafeEqual`, which the midnight-js level private-state
      // provider's storage encryption depends on. Route `crypto` / `node:crypto`
      // through a thin shim that adds the function.
      { find: /^crypto$/, replacement: cryptoShim },
      { find: /^node:crypto$/, replacement: cryptoShim },
    ],
  },
  build: {
    target: 'esnext',
  },
  optimizeDeps: {
    exclude: ['@midnight-ntwrk/onchain-runtime'],
    esbuildOptions: {
      target: 'esnext',
      plugins: [
        // Mirror the `resolve.alias` entries above at the esbuild layer.
        // Vite's optimizeDeps pre-bundling uses esbuild directly, which does
        // NOT honor `resolve.alias` — so without this plugin the midnight-js
        // storage-encryption module binds to the real `crypto-browserify`
        // (no timingSafeEqual) and fails at runtime.
        {
          name: 'alias-node-crypto-to-shim',
          setup(build) {
            build.onResolve({ filter: /^(node:)?crypto$/ }, () => ({
              path: cryptoShim,
            }));
          },
        },
      ],
    },
  },
  plugins: [react(), wasm(), nodePolyfills(), zkArtifactFourOhFour()],
})
