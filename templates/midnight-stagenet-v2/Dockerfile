FROM oven/bun:1.3.14-alpine@sha256:5acc90a93e91ff07bf72aa90a7c9f0fa189765aec90b47bdbf2152d2196383c0 AS context-audit

WORKDIR /context

COPY . .

RUN test -f /context/package.json \
    && test -f /context/bun.lock \
    && test -f /context/templates/midnight-stagenet-v2/package.json \
    && test ! -e /context/templates/midnight-stagenet-v2/.context-excluded.sentinel \
    && test ! -e /context/PLAN-midnight-stagenet-v2.md \
    && test -f /context/packages/chains/midnight-contracts/src/midnight-env.ts \
    && test -f /context/packages/chains/midnight-contracts-v2/package.json \
    && test -f /context/packages/chains/midnight-contracts-v2/src/providers.mjs \
    && test -f /context/packages/chains/midnight-contracts-v2/src/runtime-guard.mjs \
    && test -f /context/packages/chains/midnight-contracts-v2/src/ipc.mjs \
    && test -f /context/packages/chains/midnight-contracts-v2/src/call-tree-loader.mjs \
    && test -f /context/packages/chains/midnight-contracts-v2/src/call-tree-loader.d.ts \
    && test -f /context/packages/chains/midnight-contracts-v2/src/e2e-runtime.mjs \
    && test -f /context/packages/chains/midnight-contracts-v2/src/wallet-readiness.mjs \
    && test -f /context/packages/chains/midnight-contracts-v2/src/provider-worker.mjs \
    && test -f /context/packages/chains/midnight-contracts-v2/src/bun-node-bridge.mjs \
    && test -f /context/packages/chains/midnight-contracts-v2/src/index.d.ts \
    && test "$(find /context/packages/chains/midnight-contracts -type f | wc -l | tr -d ' ')" = "16" \
    && test "$(find /context/packages -type f | wc -l | tr -d ' ')" = "27"

FROM oven/bun:1.3.14-alpine@sha256:5acc90a93e91ff07bf72aa90a7c9f0fa189765aec90b47bdbf2152d2196383c0 AS lockfile-generator

WORKDIR /app

COPY --from=context-audit /context/templates/midnight-stagenet-v2/package.json ./package.json
COPY --from=context-audit /context/templates/midnight-stagenet-v2/packages/contracts/package.json ./packages/contracts/package.json
COPY --from=context-audit /context/templates/midnight-stagenet-v2/packages/network-config/package.json ./packages/network-config/package.json
COPY --from=context-audit /context/templates/midnight-stagenet-v2/packages/tests/package.json ./packages/tests/package.json
COPY --from=context-audit /context/packages/chains/midnight-contracts-v2/package.json ./packages/chains/midnight-contracts-v2/package.json

RUN bun install --lockfile-only --ignore-scripts

FROM oven/bun:1.3.14-alpine@sha256:5acc90a93e91ff07bf72aa90a7c9f0fa189765aec90b47bdbf2152d2196383c0 AS midnight-dependencies

WORKDIR /app

COPY --from=context-audit /context/templates/midnight-stagenet-v2/package.json ./package.json
COPY --from=context-audit /context/templates/midnight-stagenet-v2/bun.lock ./bun.lock
COPY --from=context-audit /context/templates/midnight-stagenet-v2/packages/contracts/package.json ./packages/contracts/package.json
COPY --from=context-audit /context/templates/midnight-stagenet-v2/packages/network-config/package.json ./packages/network-config/package.json
COPY --from=context-audit /context/templates/midnight-stagenet-v2/packages/tests/package.json ./packages/tests/package.json
COPY --from=context-audit /context/packages/chains/midnight-contracts-v2/package.json ./packages/chains/midnight-contracts-v2/package.json

RUN bun install --frozen-lockfile --ignore-scripts

FROM midnight-dependencies AS scaffold-test

COPY --from=context-audit /context/templates/midnight-stagenet-v2/packages/tests ./packages/tests

RUN --network=none bun install --frozen-lockfile --ignore-scripts

USER bun

CMD ["bun", "run", "test:scaffold"]

FROM scaffold-test AS compatibility-test

USER root

COPY --from=context-audit /context/templates/midnight-stagenet-v2/compatibility-lock.json ./compatibility-lock.json
COPY --from=context-audit /context/templates/midnight-stagenet-v2/COMPATIBILITY.md ./COMPATIBILITY.md

USER bun

CMD ["bun", "run", "test:compatibility:fixtures"]

FROM oven/bun:1.3.14-alpine@sha256:5acc90a93e91ff07bf72aa90a7c9f0fa189765aec90b47bdbf2152d2196383c0 AS compact-manager

USER root

RUN apk add --no-cache xz=5.8.3-r0

ARG TARGETARCH
RUN set -eu; \
    case "$TARGETARCH" in \
      arm64) \
        compact_asset="compact-aarch64-unknown-linux-musl.tar.xz"; \
        compact_sha256="bbeb53b34c895aa52e13a6375cbfe90bd670b2e6a72ba23356d383664a9536cf" ;; \
      amd64) \
        compact_asset="compact-x86_64-unknown-linux-musl.tar.xz"; \
        compact_sha256="684c6b3d2eef9484aabba7a0820c166ae5c169f3aecf28cbea2074840263ba66" ;; \
      *) echo "Unsupported TARGETARCH: $TARGETARCH" >&2; exit 1 ;; \
    esac; \
    wget -q "https://github.com/midnightntwrk/compact/releases/download/compact-v0.5.1/${compact_asset}" -O /tmp/compact.tar.xz; \
    echo "${compact_sha256}  /tmp/compact.tar.xz" | sha256sum -c -; \
    tar -xJf /tmp/compact.tar.xz -C /tmp; \
    install -m 0755 "/tmp/${compact_asset%.tar.xz}/compact" /usr/local/bin/compact; \
    rm -rf /tmp/compact.tar.xz "/tmp/${compact_asset%.tar.xz}"

FROM compact-manager AS compact-toolchain

ARG TARGETARCH
RUN set -eu; \
    case "$TARGETARCH" in \
      arm64) \
        compiler_asset="compactc_v0.33.0-rc.1_aarch64-unknown-linux-musl.zip"; \
        compiler_sha256="a186b604f73eff696016db517d18913a66162f5354e8b48f83e5c51ed77a04d9" ;; \
      amd64) \
        compiler_asset="compactc_v0.33.0-rc.1_x86_64-unknown-linux-musl.zip"; \
        compiler_sha256="c1d5580c5ebfe94a7604e1cf74c85fa899545e266bdbe975d9c8e16ee6d9d168" ;; \
      *) echo "Unsupported TARGETARCH: $TARGETARCH" >&2; exit 1 ;; \
    esac; \
    wget -q "https://github.com/LFDT-Minokawa/compact/releases/download/compactc-v0.33.0-rc.1/${compiler_asset}" -O /tmp/compactc.zip; \
    echo "${compiler_sha256}  /tmp/compactc.zip" | sha256sum -c -; \
    mkdir -p /opt/compactc-0.33.0-rc.1; \
    unzip -q /tmp/compactc.zip -d /opt/compactc-0.33.0-rc.1; \
    chmod 0755 /opt/compactc-0.33.0-rc.1/*; \
    mv /opt/compactc-0.33.0-rc.1/compactc /opt/compactc-0.33.0-rc.1/compactc-wrapper; \
    ln -s compactc.bin /opt/compactc-0.33.0-rc.1/compactc; \
    ln -s /opt/compactc-0.33.0-rc.1/compactc.bin /usr/local/bin/compactc; \
    rm /tmp/compactc.zip

ENV PATH="/opt/compactc-0.33.0-rc.1:${PATH}"

RUN compact --version \
    && compactc --version

WORKDIR /toolchain-smoke

COPY --from=context-audit /context/templates/midnight-stagenet-v2/packages/tests/fixtures/keccak-toolchain-smoke.compact ./keccak-toolchain-smoke.compact

RUN set -eu; \
    compactc --feature-zkir-v3 \
      ./keccak-toolchain-smoke.compact ./managed \
      >./compile.stdout 2>./compile.stderr; \
    cat ./compile.stdout; \
    cat ./compile.stderr >&2; \
    if grep -F "ZKIR not found" ./compile.stderr; then \
      echo "Compiler skipped ZKIR generation" >&2; \
      exit 1; \
    fi

FROM compact-toolchain AS compiler-test

WORKDIR /app

COPY --from=compatibility-test /app /app

CMD ["bun", "run", "test:compiler-smoke"]

FROM compact-toolchain AS crypto-event-sink-build

WORKDIR /contracts

COPY --from=context-audit /context/templates/midnight-stagenet-v2/packages/contracts ./

RUN set -eu; \
    bun run build:sink >./sink-compile.stdout 2>./sink-compile.stderr; \
    cat ./sink-compile.stdout; \
    cat ./sink-compile.stderr >&2; \
    if grep -F "ZKIR not found" ./sink-compile.stderr; then \
      echo "Compiler skipped CryptoEventSink ZKIR generation" >&2; \
      exit 1; \
    fi; \
    sha256sum ./managed/CryptoEventSink/compiler/contract-manifest.json \
      | awk '{print $1}' \
      >./managed/CryptoEventSink/compiler/contract-manifest.sha256; \
    compactc --feature-zkir-v3 \
      ./src/CryptoEventSink.compact ./reproducibility-check/CryptoEventSink \
      >./sink-repro.stdout 2>./sink-repro.stderr; \
    if grep -F "ZKIR not found" ./sink-repro.stderr; then \
      echo "Compiler skipped reproducibility-check ZKIR generation" >&2; \
      exit 1; \
    fi; \
    cmp \
      ./managed/CryptoEventSink/compiler/contract-manifest.json \
      ./reproducibility-check/CryptoEventSink/compiler/contract-manifest.json; \
    rm -rf /contracts/reproducibility-check

FROM crypto-event-sink-build AS contract-test

WORKDIR /app

COPY --from=midnight-dependencies /app/package.json ./package.json
COPY --from=midnight-dependencies /app/node_modules ./node_modules
COPY --from=context-audit /context/templates/midnight-stagenet-v2/compatibility-lock.json ./compatibility-lock.json
COPY --from=context-audit /context/templates/midnight-stagenet-v2/packages/tests ./packages/tests
COPY --from=crypto-event-sink-build /contracts/managed ./managed

USER bun

CMD ["bun", "run", "test:compile:sink"]

FROM compact-toolchain AS call-tree-build

WORKDIR /contracts

COPY --from=context-audit /context/templates/midnight-stagenet-v2/packages/contracts ./

RUN set -eu; \
    bun run build:call-tree >./call-tree-compile.stdout 2>./call-tree-compile.stderr; \
    cat ./call-tree-compile.stdout; \
    cat ./call-tree-compile.stderr >&2; \
    if grep -F "ZKIR not found" ./call-tree-compile.stderr; then \
      echo "Compiler skipped call-tree ZKIR generation" >&2; \
      exit 1; \
    fi; \
    test -s ./managed/call-tree-manifest.json; \
    mkdir -p ./negative/reverse/src ./negative/wrong-name/src; \
    cp ./build-gateway.ts ./negative/reverse/build-gateway.ts; \
    cp ./src/FeatureGateway.compact ./negative/reverse/src/FeatureGateway.compact; \
    if (cd ./negative/reverse && bun run build-gateway.ts >../reverse.stdout 2>../reverse.stderr); then \
      echo "Gateway-first compilation unexpectedly succeeded" >&2; \
      exit 1; \
    fi; \
    grep -F "Required sibling bundle is missing" ./negative/reverse.stderr; \
    cp ./build-gateway.ts ./negative/wrong-name/build-gateway.ts; \
    cp ./src/FeatureGateway.compact ./negative/wrong-name/src/FeatureGateway.compact; \
    mkdir -p ./negative/wrong-name/managed; \
    cp -R ./managed/CryptoEventSink ./negative/wrong-name/managed/WrongName; \
    if (cd ./negative/wrong-name && bun run build-gateway.ts >../wrong-name.stdout 2>../wrong-name.stderr); then \
      echo "Renamed-sibling compilation unexpectedly succeeded" >&2; \
      exit 1; \
    fi; \
    grep -F "Required sibling bundle is missing" ./negative/wrong-name.stderr; \
    rm -rf ./negative/wrong-name/managed

FROM call-tree-build AS call-tree-test

WORKDIR /app

COPY --from=midnight-dependencies /app/package.json ./package.json
COPY --from=midnight-dependencies /app/node_modules ./node_modules
COPY --from=context-audit /context/templates/midnight-stagenet-v2/compatibility-lock.json ./compatibility-lock.json
COPY --from=context-audit /context/templates/midnight-stagenet-v2/packages/tests ./packages/tests
COPY --from=call-tree-build /contracts/managed ./managed
COPY --from=call-tree-build /contracts/negative ./negative

USER bun

CMD ["bun", "run", "test:compile:call-tree"]

FROM compact-toolchain AS contract-boundary-build

COPY --from=context-audit /context/templates/midnight-stagenet-v2/packages/tests/fixtures/contracts/c06 /fixtures
COPY --from=context-audit /context/templates/midnight-stagenet-v2/packages/tests/compile-contract-fixtures.ts /runner/compile-contract-fixtures.ts

RUN bun /runner/compile-contract-fixtures.ts

FROM contract-boundary-build AS contract-boundary-test

WORKDIR /app

COPY --from=midnight-dependencies /app/package.json ./package.json
COPY --from=midnight-dependencies /app/node_modules ./node_modules
COPY --from=context-audit /context/templates/midnight-stagenet-v2/packages/tests/contracts.test.ts ./packages/tests/contracts.test.ts
COPY --from=contract-boundary-build /work/compiled-fixtures ./compiled-fixtures

USER bun

CMD ["bun", "run", "test:contracts"]

FROM midnight-dependencies AS network-profile-test

COPY --from=context-audit /context/templates/midnight-stagenet-v2/compatibility-lock.json ./compatibility-lock.json
COPY --from=context-audit /context/templates/midnight-stagenet-v2/packages/network-config ./packages/network-config
COPY --from=context-audit /context/templates/midnight-stagenet-v2/packages/tests/network-profile.test.ts ./packages/tests/network-profile.test.ts
COPY --from=context-audit /context/packages/chains/midnight-contracts/src/midnight-env.ts ./legacy/midnight-env.ts

USER bun

CMD ["bun", "run", "test:network-profile"]

FROM node:22.18.0-alpine3.22@sha256:1b2479dd35a99687d6638f5976fd235e26c5b37e8122f786fcd5fe231d63de5b AS v2-provider-test

WORKDIR /app

RUN apk add --no-cache libstdc++=14.2.0-r6

COPY --from=midnight-dependencies /usr/local/bin/bun /usr/local/bin/bun
COPY --from=midnight-dependencies /app/package.json ./package.json
COPY --from=midnight-dependencies /app/bun.lock ./bun.lock
COPY --from=midnight-dependencies /app/node_modules ./node_modules
COPY --from=midnight-dependencies /app/packages/chains/midnight-contracts-v2/node_modules ./packages/chains/midnight-contracts-v2/node_modules
COPY --from=context-audit /context/templates/midnight-stagenet-v2/compatibility-lock.json ./compatibility-lock.json
COPY --from=context-audit /context/templates/midnight-stagenet-v2/packages/network-config ./packages/network-config
COPY --from=context-audit /context/templates/midnight-stagenet-v2/packages/tests/run-v2-provider-tests.mjs ./packages/tests/run-v2-provider-tests.mjs
COPY --from=context-audit /context/templates/midnight-stagenet-v2/packages/tests/run-v2-wasm-smoke.mjs ./packages/tests/run-v2-wasm-smoke.mjs
COPY --from=context-audit /context/templates/midnight-stagenet-v2/packages/tests/v2-provider-types.ts ./packages/tests/v2-provider-types.ts
COPY --from=context-audit /context/templates/midnight-stagenet-v2/packages/tests/tsconfig.c08.json ./packages/tests/tsconfig.c08.json
COPY --from=context-audit /context/packages/chains/midnight-contracts-v2 ./packages/chains/midnight-contracts-v2
COPY --from=context-audit /context/packages/chains/midnight-contracts ./legacy/midnight-contracts

RUN --network=none node \
      ./node_modules/.bun/typescript@5.9.3/node_modules/typescript/bin/tsc \
      -p ./packages/tests/tsconfig.c08.json

USER node

CMD ["node", "packages/tests/run-v2-provider-tests.mjs"]

FROM v2-provider-test AS call-tree-loader-test

COPY --from=context-audit /context/templates/midnight-stagenet-v2/packages/tests/call-tree-loader.test.mjs ./packages/tests/call-tree-loader.test.mjs
COPY --from=call-tree-build /contracts/managed ./managed

CMD ["node", "packages/tests/call-tree-loader.test.mjs"]

FROM v2-provider-test AS sink-e2e-test

COPY --from=context-audit /context/templates/midnight-stagenet-v2/packages/tests/sink-e2e.mjs ./packages/tests/sink-e2e.mjs
COPY --from=crypto-event-sink-build /contracts/managed ./managed

CMD ["node", "packages/tests/sink-e2e.mjs"]

FROM node:22.18.0-alpine3.22@sha256:1b2479dd35a99687d6638f5976fd235e26c5b37e8122f786fcd5fe231d63de5b AS proof-smoke-test

WORKDIR /app

COPY --from=midnight-dependencies /app/package.json ./package.json
COPY --from=midnight-dependencies /app/node_modules ./node_modules
COPY --from=context-audit /context/templates/midnight-stagenet-v2/packages/tests/proof-smoke.mjs ./packages/tests/proof-smoke.mjs
COPY --from=compact-toolchain /toolchain-smoke/managed ./generated/keccak-smoke

USER node

CMD ["node", "packages/tests/proof-smoke.mjs"]
