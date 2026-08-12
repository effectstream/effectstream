# @effectstream/binary-runtime

Shared path, integrity, and offline-mode helpers for EffectStream's native
binary wrapper packages. It lets a release image keep one immutable copy of an
upstream executable outside every template's `node_modules` tree while leaving
the existing package-local cache behavior intact for normal npm consumers.

Set `EFFECTSTREAM_BINARY_CACHE_DIR` to select the external cache and
`EFFECTSTREAM_RUNTIME_DIR` for writable chain data. With
`EFFECTSTREAM_OFFLINE=1`, wrappers fail immediately when their pinned binary is
missing or invalid and never fall back to a network download or Docker pull.

The cache layout is stable and upstream-versioned:

```text
<cache>/<artifact-id>/<upstream-version>/<platform>/bin/<executable>
```

Shared caches are treated as build artifacts. Runtime `--clean-binaries`
operations are rejected while an external cache is configured so a container
cannot mutate the image's read-only reference content.
