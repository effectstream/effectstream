---
title: "Template runtime image"
description: "Run a committed template baseline with its npm dependencies, browsers, compilers, and local-chain binaries already installed."
sidebar_position: 1
---

# Template runtime image

Each successful EffectStream npm release publishes a Linux image with the same
version:

```text
ghcr.io/effectstream/template-runtime:<effectstream-version>
```

The GHCR package is public. Pulling it does not require a GitHub account or
`docker login`.

The image contains the currently approved template baseline and its unchanged
lockfiles, installed `node_modules` trees, Bun and Node, Foundry, Compact,
Solidity compilers, Playwright Chromium, Solana build tools, and the local-chain
binaries required by the templates. Runtime startup does not run `bun install`
or download a missing compiler or chain process.

An npm release does **not** rewrite template dependency pins or lockfiles.
Consequently, image version `V` records the npm release that produced the image,
while `templateBaselineVersion` records the EffectStream version intentionally
adopted by the embedded templates. These can differ.

The first image line supports `linux/amd64`. On Apple Silicon, add
`--platform linux/amd64`; Docker will use emulation. Do not assume native arm64
parity because Agave 3.0.14 has no Linux arm64 release.

## List and copy templates

Pin a semantic version or, for CI, an immutable digest:

```bash
IMAGE=ghcr.io/effectstream/template-runtime:0.103.4
docker run --rm --platform linux/amd64 "$IMAGE" list

mkdir -p effectstream-work
docker run --rm --platform linux/amd64 \
  -v "$PWD/effectstream-work:/workspace" \
  "$IMAGE" create evm-midnight-v2
```

The second command creates `effectstream-work/evm-midnight-v2`. The embedded
reference source remains read-only; the copy and its installed dependencies are
writable.

To run directly from the image, mount an empty project directory at
`/workspace`:

```bash
mkdir -p effectstream-project
docker run --rm -it --platform linux/amd64 \
  -p 127.0.0.1:15432:10599 \
  -v "$PWD/effectstream-project:/workspace" \
  -v effectstream-runtime:/home/effectstream/.effectstream/runtime \
  -v effectstream-yaci:/home/effectstream/.yaci-cli \
  "$IMAGE" dev evm-midnight-v2
```

The example uses a host port above 10000 and binds it only to loopback. Internal
ports are fixed by each template; choose any free host port. Stop the container
with Ctrl-C. Remove the example state with:

```bash
docker volume rm effectstream-runtime effectstream-yaci
```

## Where binaries and state live

Versioned executables are immutable and shared by every embedded template:

```text
/opt/effectstream/cache/binaries/<artifact>/<upstream-version>/linux-amd64/bin/<executable>
```

For the Midnight 1.x stack this resolves to:

```text
/opt/effectstream/cache/binaries/midnight-node/1.0.0/linux-amd64/bin/midnight-node
/opt/effectstream/cache/binaries/midnight-indexer/v4.3.3/linux-amd64/bin/indexer-standalone
/opt/effectstream/cache/binaries/midnight-proof-server/ledger-8.1.0/linux-amd64/bin/midnight-proof-server
```

The wrappers resolve those paths through `EFFECTSTREAM_BINARY_CACHE_DIR`. They
write databases, configuration, sockets, ledgers, and logs below
`EFFECTSTREAM_RUNTIME_DIR`, not beside the executable. `EFFECTSTREAM_OFFLINE=1`
causes a missing or invalid binary to fail immediately instead of downloading or
using a mutable Docker fallback.

Cardano is similar: the verified node payload stays in the shared cache, while
the entrypoint creates links in the writable `~/.yaci-cli` tree where Yaci
expects them. Dolos uses one shared verified executable instead of repeating its
npm postinstall download for every Cardano template.

## Offline guarantee

The zero-download guarantee applies to an unchanged template, lockfile, and
local-development configuration from the embedded template baseline. The release
gate runs with Docker outbound networking disabled and verifies the embedded
runtime binaries before the version tag is promoted.

Changing npm or Cargo dependencies, selecting a production RPC endpoint, or
editing a contract so it needs a package absent from the release caches can
require network access. Those are new inputs, not part of the immutable release
template.

## Release tags and CI

- `<version>` is immutable and matches the npm release.
- `sha-<git-sha>` identifies the release source commit.
- `latest` moves only after npm publication, image construction, offline tests,
  SBOM creation, and provenance attestation succeed.
- CI should pin `ghcr.io/effectstream/template-runtime@sha256:<digest>`.

The image embeds `/opt/effectstream/runtime-manifest.json`, including the
npm/image EffectStream version, independent template baseline version, source
SHA, template lock digests, artifact versions, and toolchain checksums.

Before promotion, the build scans the public payload for credential files,
private-key blocks, recognizable service-token formats, and sensitive image
environment variables. `.env` files, npm credentials, SSH material, and common
private-key files are excluded from the Docker build context. The release job
also verifies package visibility and finishes with an anonymous pull.

## Maintainer workflow

Normal npm releases never edit `templates/**`. To adopt a published EffectStream
version in the enabled templates, run **Actions → Sync Template Baseline** with
the desired npm version and target branch. That manually dispatched workflow:

1. verifies that the requested npm packages exist;
2. updates enabled-template EffectStream pins;
3. regenerates only enabled-template lockfiles;
4. advances `templateBaselineVersion`;
5. audits and commits only those template-baseline files.

The next new npm release and its image embed that baseline. Existing image
version tags remain immutable and cannot be rebuilt with a later template
baseline. This keeps template upgrades reviewable and independent from npm
publication.

Direct downloads are declared in
`.github/template-runtime-artifacts.json`. When an upstream payload changes:

1. pin the exact versioned HTTPS URL;
2. verify the vendor-published archive digest when available;
3. record the extracted executable digest;
4. update the corresponding wrapper version/checksum table;
5. run `bun runtime:artifacts --verify-only` and the Docker offline checks;
6. rebuild through `.github/workflows/template-runtime-image.yaml`.

The manual workflow accepts an already-published npm version, so a failed image
build can be retried without republishing packages. It refuses to overwrite an
existing version or source-SHA tag with a different digest.

The image cannot be built on GitHub's standard 14 GB Linux runner. Configure
the repository variable `TEMPLATE_RUNTIME_RUNNER` with a larger-runner label
whose fresh filesystem has at least 50 GiB free, or provide that label through
the manual workflow's `runner` input. The workflow checks capacity before any
download. After pushing the candidate and its attestations, it deletes the
ephemeral runner's BuildKit cache before pulling the candidate for offline
tests; this keeps build and extracted-image peaks from overlapping.

GHCR creates a new container package as private. After the first candidate is
pushed, an EffectStream organization owner must open the `template-runtime`
package settings and change its visibility to **Public**. The release workflow
will deliberately stop before stable-tag promotion until this one-time setting
is complete.
