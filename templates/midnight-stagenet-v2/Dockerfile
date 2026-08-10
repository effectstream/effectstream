FROM oven/bun:1.3.14-alpine@sha256:5acc90a93e91ff07bf72aa90a7c9f0fa189765aec90b47bdbf2152d2196383c0 AS context-audit

WORKDIR /context

COPY . .

RUN test -f /context/package.json \
    && test -f /context/bun.lock \
    && test -f /context/templates/midnight-stagenet-v2/package.json \
    && test ! -e /context/templates/midnight-stagenet-v2/.context-excluded.sentinel \
    && test ! -e /context/PLAN-midnight-stagenet-v2.md \
    && test ! -d /context/packages

FROM oven/bun:1.3.14-alpine@sha256:5acc90a93e91ff07bf72aa90a7c9f0fa189765aec90b47bdbf2152d2196383c0 AS scaffold-test

WORKDIR /app

COPY --from=context-audit /context/templates/midnight-stagenet-v2/package.json ./package.json
COPY --from=context-audit /context/templates/midnight-stagenet-v2/bun.lock ./bun.lock
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
