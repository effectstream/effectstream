#!/usr/bin/env bun
/**
 * External regression controller for `templates/single-file`.
 *
 * This file is NOT part of the distributed template. The template is exactly
 * `single-file/minimal.ts` + `single-file/package.json`; everything here lives
 * outside it and drives an *unmodified* copy of those two files.
 *
 *   bun templates/test-single-file.ts static         # shape, imports, ordering
 *   bun templates/test-single-file.ts deterministic  # loopback indexer, real pipeline
 *   bun templates/test-single-file.ts lifecycle      # startup failure + SIGINT + SIGTERM
 *   bun templates/test-single-file.ts live           # read-only Stagenet oracle
 *   bun templates/test-single-file.ts ci             # static + deterministic + lifecycle
 *   bun templates/test-single-file.ts all            # ci + live
 *
 * Modes other than `static` copy the two template files into a fresh `mktemp -d`
 * outside every repository, install their declared dependencies from the public
 * registry, and run them there on validated free ports above 10000. Nothing is
 * written into the template directory and no shared Docker/system state is
 * touched.
 *
 * `deterministic` redirects the Midnight indexer to a loopback GraphQL fixture
 * through a preload module that lives *outside* the runtime context, so the two
 * copied files stay byte-identical to the committed template. It never replaces
 * the `live` mode, which is the only Stagenet oracle. `live` is strictly
 * read-only: it observes the already-deployed contract and submits nothing.
 */
import net from "node:net";
import { spawn, type Subprocess } from "bun";
import {
  cp,
  mkdtemp,
  readdir,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const TEMPLATE_DIR = fileURLToPath(new URL("./single-file/", import.meta.url));
const TEMPLATE_FILES = ["minimal.ts", "package.json"] as const;

/** Values the committed template must carry — the P0 Stagenet deployment. */
const EXPECTED = {
  network: "stagenet",
  contract: "38317e99d1f43362a67187a00496727ff23fe8a174cc1836a4ce9c492ab48012",
  startBlockHeight: 232_938,
  liveRound: "0",
  indexer: "https://indexer.stagenet.shielded.tools/api/v4/graphql",
} as const;

// ---------------------------------------------------------------------------
// tiny assertion + reporting helpers
// ---------------------------------------------------------------------------

let checks = 0;
const failures: string[] = [];

function ok(condition: unknown, label: string, detail?: string): void {
  checks++;
  if (condition) {
    console.log(`  ok   ${label}`);
  } else {
    console.log(`  FAIL ${label}${detail ? `\n       ${detail}` : ""}`);
    failures.push(label);
  }
}

function section(title: string): void {
  console.log(`\n=== ${title} ===`);
}

class BoundedWaitError extends Error {}

async function waitFor(
  label: string,
  predicate: () => boolean | Promise<boolean>,
  timeoutMs: number,
  intervalMs = 250,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    if (await predicate()) return;
    if (Date.now() >= deadline) {
      throw new BoundedWaitError(`timed out after ${timeoutMs}ms waiting for: ${label}`);
    }
    await Bun.sleep(intervalMs);
  }
}

// ---------------------------------------------------------------------------
// ports
// ---------------------------------------------------------------------------

function bindableOn(port: number, host: string): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", () => resolve(false));
    server.listen(port, host, () => server.close(() => resolve(true)));
  });
}

/**
 * True when the port is genuinely reusable. Both hosts are checked on purpose:
 * SO_REUSEADDR lets a wildcard bind coexist with a loopback bind on some
 * platforms, so a loopback-only probe can report "free" while a listener on
 * 0.0.0.0 is still up. The runtime binds 0.0.0.0 and PGlite binds loopback.
 */
async function portIsFree(port: number): Promise<boolean> {
  return (await bindableOn(port, "127.0.0.1")) && (await bindableOn(port, "0.0.0.0"));
}

/** True when something accepts a TCP connection on the port. */
function portAcceptsConnections(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.connect({ host: "127.0.0.1", port });
    const done = (value: boolean) => {
      socket.destroy();
      resolve(value);
    };
    socket.setTimeout(1_000);
    socket.once("connect", () => done(true));
    socket.once("timeout", () => done(false));
    socket.once("error", () => done(false));
  });
}

/**
 * A free TCP port strictly above 10000. This machine is shared, so the port is
 * both randomised and verified free at selection time.
 */
async function freeHighPort(taken: Set<number>): Promise<number> {
  for (let attempt = 0; attempt < 200; attempt++) {
    const port = 10_001 + Math.floor(Math.random() * (65_535 - 10_001));
    if (taken.has(port)) continue;
    if (await portIsFree(port)) {
      taken.add(port);
      return port;
    }
  }
  throw new Error("could not find a free port above 10000");
}

/**
 * Hold a port the way the runtime would take it. The bind host must match the
 * runtime's (`0.0.0.0`): a loopback-only blocker does NOT conflict with a
 * wildcard bind, so the app would start happily and the startup-failure case
 * would silently test nothing.
 */
function occupyPort(port: number): Promise<net.Server> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    // Track and destroy accepted sockets: the readiness probe connects to this
    // blocker, and `server.close()` waits for open connections, so an untracked
    // half-open socket would hang the harness rather than the product.
    const sockets = new Set<net.Socket>();
    server.on("connection", (socket) => {
      sockets.add(socket);
      socket.on("close", () => sockets.delete(socket));
    });
    (server as net.Server & { destroySockets?: () => void }).destroySockets = () => {
      for (const socket of sockets) socket.destroy();
      sockets.clear();
    };
    server.once("error", reject);
    server.listen(port, "0.0.0.0", () => resolve(server));
  });
}

function closeServer(server: net.Server): Promise<void> {
  (server as net.Server & { destroySockets?: () => void }).destroySockets?.();
  return new Promise((resolve) => server.close(() => resolve()));
}

// ---------------------------------------------------------------------------
// static mode
// ---------------------------------------------------------------------------

/** Strip comments and string/template literals so scans see code only. */
function codeOnly(source: string): string {
  let out = "";
  let i = 0;
  while (i < source.length) {
    const two = source.slice(i, i + 2);
    if (two === "//") {
      const end = source.indexOf("\n", i);
      const stop = end === -1 ? source.length : end;
      out += " ".repeat(stop - i);
      i = stop;
      continue;
    }
    if (two === "/*") {
      const end = source.indexOf("*/", i + 2);
      const stop = end === -1 ? source.length : end + 2;
      out += source.slice(i, stop).replace(/[^\n]/g, " ");
      i = stop;
      continue;
    }
    const ch = source[i];
    if (ch === '"' || ch === "'" || ch === "`") {
      const quote = ch;
      let j = i + 1;
      while (j < source.length) {
        if (source[j] === "\\") {
          j += 2;
          continue;
        }
        if (source[j] === quote) break;
        j++;
      }
      const stop = Math.min(j + 1, source.length);
      out += source.slice(i, stop).replace(/[^\n]/g, " ");
      i = stop;
      continue;
    }
    out += ch;
    i++;
  }
  return out;
}

/** Index of the closing delimiter matching the opener at `open`. */
function matchDelimiter(code: string, open: number): number {
  const pairs: Record<string, string> = { "(": ")", "{": "}", "[": "]" };
  const closer = pairs[code[open]];
  if (!closer) throw new Error(`not an opening delimiter at ${open}`);
  let depth = 0;
  for (let i = open; i < code.length; i++) {
    const ch = code[i];
    if (ch === "(" || ch === "{" || ch === "[") depth++;
    else if (ch === ")" || ch === "}" || ch === "]") {
      depth--;
      if (depth === 0) return i;
    }
  }
  throw new Error(`unbalanced delimiter opened at ${open}`);
}

async function modeStatic(): Promise<void> {
  section("static: distributed shape");

  const entries = await readdir(TEMPLATE_DIR, { withFileTypes: true, recursive: true });
  const regular = entries.filter((e) => e.isFile()).map((e) => e.name).sort();
  ok(
    regular.length === 2 && regular[0] === "minimal.ts" && regular[1] === "package.json",
    "template directory holds exactly minimal.ts + package.json",
    `saw: ${JSON.stringify(regular)}`,
  );
  ok(
    entries.every((e) => e.isFile()),
    "template directory has no subdirectories",
  );

  const source = await readFile(join(TEMPLATE_DIR, "minimal.ts"), "utf8");
  const manifest = JSON.parse(await readFile(join(TEMPLATE_DIR, "package.json"), "utf8"));
  const declared: Record<string, string> = manifest.dependencies ?? {};

  section("static: import closure");

  // Every `from "..."` specifier, including type-only ones the transpiler
  // erases: an undeclared type-only dependency is still an undeclared
  // dependency for anyone installing this template.
  const syntactic = [...source.matchAll(/\bfrom\s+["']([^"']+)["']/g)].map((m) => m[1]);
  // And every specifier Bun itself resolves, so a dynamic `import()` or a
  // require-style specifier cannot slip past the regex.
  const scanned = new Bun.Transpiler({ loader: "ts" }).scan(source).imports.map((i) => i.path);
  const specifiers = [...new Set([...syntactic, ...scanned])].sort();
  console.log(`  specifiers: ${specifiers.join(", ")}`);

  const packageOf = (specifier: string) =>
    specifier.startsWith("@")
      ? specifier.split("/").slice(0, 2).join("/")
      : specifier.split("/")[0];

  ok(
    specifiers.every((s) => !s.startsWith(".") && !s.startsWith("/")),
    "no relative or absolute path import (nothing outside the two files)",
    specifiers.filter((s) => s.startsWith(".") || s.startsWith("/")).join(", "),
  );
  const undeclared = specifiers
    .map(packageOf)
    .filter((p) => !Object.hasOwn(declared, p) && !p.startsWith("node:") && p !== "bun");
  ok(undeclared.length === 0, "every imported package is declared in package.json", undeclared.join(", "));

  const used = new Set(specifiers.map(packageOf));
  const unused = Object.keys(declared).filter((d) => !used.has(d));
  ok(unused.length === 0, "every declared dependency is actually imported", unused.join(", "));

  ok(
    Object.values(declared).every((v) => /^\d+\.\d+\.\d+$/.test(v)),
    "every dependency is pinned to an exact version",
    JSON.stringify(declared),
  );
  ok(
    Object.values(declared).every((v) => !/^(workspace|file|link|portal):/.test(v)),
    "no workspace:, file:, link: or portal: dependency",
  );

  section("static: forbidden surfaces");

  const code = codeOnly(source);
  const forbidden: [RegExp, string][] = [
    [/@effectstream\/node-sdk/, "no @effectstream/node-sdk umbrella dependency"],
    [/\brunNode\b/, "no runNode facade call"],
    [/\bmidnightContract\s*\(/, "no midnightContract facade call"],
    [/\bpglite\s*\(/, "no pglite() facade call"],
    [/\bMidnightNetwork\b/, "no MidnightNetwork facade type"],
    [/\bRunNodeOptions\b/, "no RunNodeOptions facade type"],
    [/node_modules|\.\.\/\.\.\//, "no monorepo path reference"],
    [/\bchild_process\b|Bun\.spawn/, "no child process"],
    [/\bproofServer\b|proof-server/, "no proof server"],
    [/walletSeed|MIDNIGHT_WALLET|genesisWalletSeed|mnemonic/i, "no wallet or seed material"],
    [/faucet/i, "no faucet use"],
    [/buildWalletAndWaitForFunds|configureMidnightNodeProviders/, "no seed-logging or password-defaulting wallet path"],
    [/contract-counter|managed\/|\.compact\b/, "no generated contract artifact"],
    [/contract-state\.hex|test-fixtures/, "no adjacent test fixture"],
  ];
  for (const [pattern, label] of forbidden) {
    ok(!pattern.test(code), label, `matched: ${code.match(pattern)?.[0]}`);
  }

  section("static: committed deployment values");

  // These three read the raw source: `codeOnly` blanks string literals, which
  // is exactly what the committed address and network name are.
  ok(source.includes(`"${EXPECTED.contract}"`), "exact P0 Stagenet contract address is committed");
  ok(
    /START_BLOCK_HEIGHT\s*=\s*232_938\b/.test(code),
    "exact P0 deployment height 232938 is committed",
  );
  ok(
    /defaultMidnightNetworkConfig\(\s*"stagenet"\s*\)/.test(source),
    'endpoints come from defaultMidnightNetworkConfig("stagenet")',
  );
  ok(
    !/https?:\/\/[^\s"'`]*(shielded\.tools|midnight\.network)/.test(source),
    "no Stagenet endpoint URL is duplicated in the template",
  );
  ok(
    /indexer:\s*midnight\.indexer\b/.test(code),
    "the indexer is passed explicitly from the owning profile",
  );
  ok(
    !/fetchLatestBlock|block\s*{\s*height|"latest"/.test(code),
    "no template-side tip query or 'latest' start height",
  );
  ok(!/\bpreview\b|\bpreprod\b/i.test(code), "no Preview/Preprod fallback");

  section("static: cleanup ordering inside the Effection scope");

  const mainCall = code.indexOf("main(");
  ok(mainCall !== -1, "the program is driven by effection main()");
  const mainOpen = code.indexOf("(", mainCall);
  const mainClose = matchDelimiter(code, mainOpen);
  const mainBody = code.slice(mainOpen, mainClose);
  const mainStart = mainOpen;

  const acquire = code.indexOf("startPglite(");
  ok(
    acquire > mainStart && acquire < mainClose,
    "PGlite is acquired INSIDE the main() scope, not at module top level",
  );
  ok(
    (code.match(/startPglite\(/g) ?? []).length === 1,
    "PGlite is acquired exactly once",
  );

  const ensureIdx = code.indexOf("ensure(", acquire);
  ok(ensureIdx !== -1 && ensureIdx < mainClose, "an ensure() cleanup is registered inside main()");
  const ensureOpen = code.indexOf("(", ensureIdx);
  const ensureClose = matchDelimiter(code, ensureOpen);
  const ensureBody = code.slice(ensureOpen, ensureClose);
  ok(
    /close\(\s*{\s*force:\s*true\s*}\s*\)/.test(ensureBody),
    "the registered cleanup is the owner-only forced close",
  );

  const readyIdx = code.indexOf("waitReady", ensureClose);
  ok(readyIdx !== -1 && readyIdx < mainClose, "readiness is awaited inside main()");
  ok(
    acquire < ensureIdx && ensureIdx < readyIdx,
    "order is: acquire -> register forced close -> await readiness",
    `acquire=${acquire} ensure=${ensureIdx} waitReady=${readyIdx}`,
  );
  ok(
    (code.match(/waitReady/g) ?? []).length === 1 &&
      code.indexOf("waitReady") === readyIdx,
    "readiness is never awaited before the cleanup is registered",
  );

  // Nothing that can suspend (and therefore fail or be cancelled) may run
  // between acquiring the database and registering its cleanup. The `yield*`
  // that drives the `ensure` statement itself is the boundary, not a violation,
  // so scan up to the start of that statement.
  const ensureStatementStart = code.lastIndexOf("yield", ensureIdx);
  const between = code.slice(acquire, ensureStatementStart === -1 ? ensureIdx : ensureStatementStart);
  const suspensionPoints = (between.match(/yield\s*\*/g) ?? []).length;
  ok(
    suspensionPoints === 0,
    "no suspension point between acquisition and cleanup registration",
    `found ${suspensionPoints} in: ${JSON.stringify(between.trim())}`,
  );

  const startIdx = code.indexOf("start(", readyIdx);
  ok(startIdx > readyIdx && startIdx < mainClose, "the runtime starts only after readiness");
  ok(mainBody.includes("suspend()"), "main() suspends instead of exiting immediately");
}

// ---------------------------------------------------------------------------
// staging: an isolated registry-only runtime context
// ---------------------------------------------------------------------------

type Stage = {
  /** Runtime context: contains ONLY the two template files (plus install output). */
  runtimeDir: string;
  /** Harness-only scratch space, deliberately outside the runtime context. */
  harnessDir: string;
  root: string;
};

async function stage(label: string): Promise<Stage> {
  const root = await mkdtemp(join(tmpdir(), `single-file-${label}-`));
  const runtimeDir = join(root, "app");
  const harnessDir = join(root, "harness");
  await Bun.$`mkdir -p ${runtimeDir} ${harnessDir}`.quiet();

  for (const file of TEMPLATE_FILES) {
    await cp(join(TEMPLATE_DIR, file), join(runtimeDir, file));
  }
  const copied = (await readdir(runtimeDir)).sort();
  ok(
    copied.length === 2 && copied[0] === "minimal.ts" && copied[1] === "package.json",
    `[${label}] runtime context contains only the two distributed files`,
    JSON.stringify(copied),
  );

  console.log(`  installing from the public registry in ${runtimeDir} ...`);
  const install = await Bun.$`bun install --no-save`.cwd(runtimeDir).quiet().nothrow();
  ok(install.exitCode === 0, `[${label}] registry install succeeds`, install.stderr.toString().slice(-800));

  return { runtimeDir, harnessDir, root };
}

async function verifyResolvedGraph(stage: Stage): Promise<void> {
  section("registry closure");
  const manifest = JSON.parse(await readFile(join(stage.runtimeDir, "package.json"), "utf8"));
  const declared: Record<string, string> = manifest.dependencies;

  for (const [name, version] of Object.entries(declared)) {
    const installed = JSON.parse(
      await readFile(join(stage.runtimeDir, "node_modules", name, "package.json"), "utf8"),
    );
    ok(installed.version === version, `${name} resolves to exactly ${version}`, `got ${installed.version}`);
  }

  // No workspace/file/link escape hatch anywhere in the installed tree.
  const effectstreamDir = join(stage.runtimeDir, "node_modules", "@effectstream");
  const installedNames = await readdir(effectstreamDir);
  const versions = new Map<string, string>();
  for (const name of installedNames) {
    const pkgPath = join(effectstreamDir, name, "package.json");
    try {
      versions.set(name, JSON.parse(await readFile(pkgPath, "utf8")).version);
    } catch {
      /* not a package directory */
    }
  }
  const distinct = new Set(versions.values());
  ok(
    distinct.size === 1 && distinct.has("0.200.5"),
    `all ${versions.size} @effectstream packages converge at one published version`,
    [...versions].map(([n, v]) => `${n}@${v}`).join(", "),
  );

  for (const name of Object.keys(declared)) {
    const link = await stat(join(stage.runtimeDir, "node_modules", name)).catch(() => undefined);
    ok(link !== undefined, `${name} is materialised in the isolated node_modules`);
  }
}

// ---------------------------------------------------------------------------
// running the app
// ---------------------------------------------------------------------------

type AppRun = {
  proc: Subprocess<"ignore", "pipe", "pipe">;
  log: () => string;
  exited: Promise<number>;
};

function runApp(opts: {
  cwd: string;
  apiPort: number;
  dbPort: number;
  preload?: string;
  extraEnv?: Record<string, string>;
}): AppRun {
  const argv = ["bun"];
  if (opts.preload) argv.push("--preload", opts.preload);
  argv.push("minimal.ts");

  const proc = spawn({
    cmd: argv,
    cwd: opts.cwd,
    stdout: "pipe",
    stderr: "pipe",
    env: {
      ...process.env,
      EFFECTSTREAM_API_PORT: String(opts.apiPort),
      DB_PORT: String(opts.dbPort),
      ...opts.extraEnv,
    },
  }) as Subprocess<"ignore", "pipe", "pipe">;

  let buffer = "";
  const drain = async (stream: ReadableStream<Uint8Array>) => {
    const decoder = new TextDecoder();
    for await (const chunk of stream as any) buffer += decoder.decode(chunk);
  };
  void drain(proc.stdout as ReadableStream<Uint8Array>).catch(() => {});
  void drain(proc.stderr as ReadableStream<Uint8Array>).catch(() => {});

  return { proc, log: () => buffer, exited: proc.exited };
}

async function fetchHome(apiPort: number): Promise<string | undefined> {
  try {
    const response = await fetch(`http://127.0.0.1:${apiPort}/`, {
      signal: AbortSignal.timeout(3_000),
    });
    if (!response.ok) return undefined;
    return await response.text();
  } catch {
    return undefined;
  }
}

async function waitForReady(run: AppRun, apiPort: number, timeoutMs: number): Promise<string> {
  let html: string | undefined;
  await waitFor(
    `HTTP readiness on ${apiPort}`,
    async () => {
      if (run.proc.exitCode !== null) {
        throw new Error(`app exited early (${run.proc.exitCode}):\n${tail(run.log())}`);
      }
      html = await fetchHome(apiPort);
      return html !== undefined;
    },
    timeoutMs,
  );
  return html!;
}

function tail(text: string, lines = 25): string {
  return text.split("\n").slice(-lines).join("\n");
}

/**
 * Every teardown guarantee the specification asks for, asserted the same way in
 * every lifecycle case so one lucky run cannot pass for all of them.
 */
async function assertFullTeardown(label: string, apiPort: number, dbPort: number): Promise<void> {
  ok(!(await portAcceptsConnections(dbPort)), `${label}: PGlite gateway listener is closed`);
  ok(!(await portAcceptsConnections(apiPort)), `${label}: HTTP listener is closed`);
  ok(await portIsFree(dbPort), `${label}: DB port ${dbPort} is immediately reusable`);
  ok(await portIsFree(apiPort), `${label}: API port ${apiPort} is immediately reusable`);
}

// ---------------------------------------------------------------------------
// deterministic mode: loopback indexer fixture
// ---------------------------------------------------------------------------

/**
 * Build a real `midnight:contract-state[v8]` blob whose leading ledger field is
 * a `uint128` holding `round`. Constructed in-process with the same
 * onchain-runtime the decoder uses, so the fixture is authentic rather than a
 * recorded byte string, and no fixture file has to be committed.
 */
async function buildContractStateHex(runtimeDir: string, round: bigint): Promise<string> {
  const script = `
    const { ContractState, ChargedState, StateValue, bigIntToValue } =
      await import("@midnight-ntwrk/onchain-runtime");
    const alignment = [{ tag: "atom", value: { tag: "field" } }];
    const state = new ContractState();
    state.data = new ChargedState(
      StateValue.newArray().arrayPush(
        StateValue.newCell({ value: bigIntToValue(${round}n), alignment }),
      ),
    );
    process.stdout.write(Buffer.from(state.serialize()).toString("hex"));
  `;
  const result = await Bun.$`bun -e ${script}`.cwd(runtimeDir).quiet();
  const hex = result.stdout.toString().trim();
  if (!/^[0-9a-f]+$/.test(hex)) {
    throw new Error(`could not build a contract state blob: ${result.stderr.toString().slice(-500)}`);
  }
  return hex;
}

type Fixture = {
  port: number;
  stop: () => Promise<void>;
  blockRequests: () => number;
};

async function startIndexerFixture(opts: {
  port: number;
  stateHex: string;
  deployHeight: number;
}): Promise<Fixture> {
  let blockRequests = 0;
  const BLOCK_TIME_MS = 6_000;
  const LEAD_BLOCKS = 5;
  const startedAt = Date.now();

  // A live chain, not a frozen snapshot. The engine merges a parallel chain's
  // data into the main NTP clock by timestamp, so a chain whose blocks are all
  // in the past never catches up to "now" and nothing is ever finalised — which
  // is exactly what a frozen fixture produces. Anchor the chain so the block
  // `deployHeight + LEAD_BLOCKS` sits at the fixture's start time and later
  // heights advance in real time, mirroring how Stagenet actually behaves.
  const anchor = deployHeightAnchor();
  function deployHeightAnchor(): number {
    return startedAt - (LEAD_BLOCKS * BLOCK_TIME_MS);
  }
  const timestampOf = (height: number) =>
    anchor + (height - opts.deployHeight) * BLOCK_TIME_MS;
  const currentTip = () =>
    opts.deployHeight + LEAD_BLOCKS +
    Math.floor((Date.now() - startedAt) / BLOCK_TIME_MS);

  const server = Bun.serve({
    port: opts.port,
    hostname: "127.0.0.1",
    async fetch(request) {
      const body = (await request.json()) as { query: string };
      const query = body.query ?? "";
      const offset = /offset:\s*{\s*height:\s*(\d+)\s*}/.exec(query);

      if (!offset) {
        return Response.json({ data: { block: { height: currentTip() } } });
      }

      blockRequests++;
      const height = Number(offset[1]);
      const isDeploy = height === opts.deployHeight;
      return Response.json({
        data: {
          block: {
            hash: `0x${height.toString(16).padStart(64, "0")}`,
            height,
            protocolVersion: 2_000_000,
            timestamp: timestampOf(height),
            parent: { hash: `0x${(height - 1).toString(16).padStart(64, "0")}` },
            transactions: isDeploy
              ? [{
                hash: `0x${"ab".repeat(32)}`,
                protocolVersion: 2_000_000,
                contractActions: [{ address: EXPECTED.contract, state: opts.stateHex }],
                zswapLedgerEvents: [],
              }]
              : [],
          },
        },
      });
    },
  });

  return {
    port: server.port,
    stop: async () => {
      await server.stop(true);
    },
    blockRequests: () => blockRequests,
  };
}

/** A preload module that redirects only the Stagenet indexer to the fixture. */
async function writeIndexerRedirect(harnessDir: string, fixturePort: number): Promise<string> {
  const file = join(harnessDir, "redirect-indexer.ts");
  await writeFile(
    file,
    `// Harness-only. Lives outside the runtime context and is never distributed.
const REAL = ${JSON.stringify(EXPECTED.indexer)};
const FIXTURE = "http://127.0.0.1:${fixturePort}/graphql";
const original = globalThis.fetch;
globalThis.fetch = ((input: any, init?: any) => {
  const url = typeof input === "string" ? input : input?.url;
  if (url === REAL) return original(FIXTURE, init);
  if (typeof url === "string" && !url.startsWith("http://127.0.0.1")) {
    return Promise.reject(new Error("deterministic mode blocked an external request: " + url));
  }
  return original(input, init);
}) as typeof fetch;
`,
    "utf8",
  );
  return file;
}

async function modeDeterministic(taken: Set<number>): Promise<void> {
  section("deterministic: loopback indexer through the real pipeline");
  const staged = await stage("deterministic");
  const apiPort = await freeHighPort(taken);
  const dbPort = await freeHighPort(taken);
  const fixturePort = await freeHighPort(taken);
  console.log(`  ports: api=${apiPort} db=${dbPort} fixture=${fixturePort}`);

  // A value the live chain does not currently hold, so a fixture result can
  // never be mistaken for the live oracle's.
  const ROUND = 42n;
  const stateHex = await buildContractStateHex(staged.runtimeDir, ROUND);
  ok(
    stateHex.startsWith(Buffer.from("midnight:contract-state[v8]:").toString("hex")),
    "fixture state is a genuine onchain-runtime v8 contract state",
  );

  const fixture = await startIndexerFixture({
    port: fixturePort,
    stateHex,
    deployHeight: EXPECTED.startBlockHeight,
  });
  const preload = await writeIndexerRedirect(staged.harnessDir, fixturePort);

  const run = runApp({ cwd: staged.runtimeDir, apiPort, dbPort, preload });
  let html = "";
  try {
    await waitForReady(run, apiPort, 180_000);
    await waitFor(
      "the decoded round reaches the HTML",
      async () => {
        html = (await fetchHome(apiPort)) ?? "";
        return html.includes(`Round: ${ROUND}`);
      },
      180_000,
    );
    ok(html.includes(`Round: ${ROUND}`), "fetcher -> primitive -> Stm -> HTML carries the decoded round");
    ok(html.includes(`Network: ${EXPECTED.network}`), "HTML reports the configured network");
    ok(html.includes(`Contract: ${EXPECTED.contract}`), "HTML reports the configured contract");
    ok(fixture.blockRequests() > 0, "the loopback indexer actually served the block range");
    ok(
      run.log().includes(`[MidnightClient] Using indexer ${EXPECTED.indexer}`),
      "the app still resolved its indexer from the owning Stagenet profile",
    );
    ok(
      !run.log().includes("deterministic mode blocked an external request"),
      "no request escaped to a non-loopback host",
    );

    // The runtime context is still byte-identical to the committed template.
    for (const file of TEMPLATE_FILES) {
      const before = await readFile(join(TEMPLATE_DIR, file));
      const after = await readFile(join(staged.runtimeDir, file));
      ok(before.equals(after), `${file} ran unmodified`);
    }
  } catch (error) {
    console.log(`  app log:\n${tail(run.log(), 60)}`);
    throw error;
  } finally {
    run.proc.kill("SIGTERM");
    await run.exited.catch(() => {});
    await fixture.stop();
    await rm(staged.root, { recursive: true, force: true });
  }
  await assertFullTeardown("deterministic", apiPort, dbPort);
}

// ---------------------------------------------------------------------------
// lifecycle mode
// ---------------------------------------------------------------------------

async function lifecycleStartupFailure(staged: Stage, taken: Set<number>): Promise<void> {
  section("lifecycle: startup failure after PGlite acquisition");
  const apiPort = await freeHighPort(taken);
  const dbPort = await freeHighPort(taken);
  const blocker = await occupyPort(apiPort);
  console.log(`  ports: api=${apiPort} (occupied) db=${dbPort}`);

  const run = runApp({ cwd: staged.runtimeDir, apiPort, dbPort });
  let exitCode: number | null = null;
  try {
    // The database must be acquired *before* the injected failure, or the test
    // would prove nothing about unwinding an owned resource.
    await waitFor(
      "PGlite acquisition to be logged",
      () => {
        if (run.proc.exitCode !== null && !run.log().includes("database: server listening")) {
          throw new Error(`app exited before acquiring PGlite:\n${tail(run.log())}`);
        }
        return run.log().includes(`database: server listening on port ${dbPort}`);
      },
      180_000,
    );
    ok(true, "PGlite was acquired before the injected startup failure");

    ok(
      (await fetchHome(apiPort)) === undefined,
      "the occupied API port really did prevent the app's own HTTP server",
    );

    exitCode = await Promise.race([
      run.exited,
      Bun.sleep(120_000).then(() => null),
    ]);
    ok(exitCode !== null, "the app exits instead of hanging on a failed start");
    // `null` means "still running" — it must not be allowed to satisfy
    // "nonzero", or a hang would read as a clean failure.
    ok(
      typeof exitCode === "number" && exitCode !== 0,
      `startup failure exits nonzero (got ${exitCode})`,
    );
  } finally {
    if (run.proc.exitCode === null) run.proc.kill("SIGKILL");
    await run.exited.catch(() => {});
  }

  // Only meaningful because the process exited on its own above; a SIGKILL
  // would close these sockets regardless of what the program does.
  ok(!(await portAcceptsConnections(dbPort)), "startup failure: PGlite gateway listener is closed");
  ok(await portIsFree(dbPort), `startup failure: DB port ${dbPort} is immediately reusable`);
  await closeServer(blocker);
  ok(await portIsFree(apiPort), `startup failure: API port ${apiPort} is immediately reusable`);
}

async function lifecycleSignal(
  staged: Stage,
  taken: Set<number>,
  signal: "SIGINT" | "SIGTERM",
  expectedStatus: number,
): Promise<void> {
  section(`lifecycle: ${signal} after readiness`);
  const apiPort = await freeHighPort(taken);
  const dbPort = await freeHighPort(taken);
  console.log(`  ports: api=${apiPort} db=${dbPort}`);

  const run = runApp({ cwd: staged.runtimeDir, apiPort, dbPort });
  let exitCode: number | null = null;
  try {
    await waitForReady(run, apiPort, 180_000);
    ok(await portAcceptsConnections(dbPort), `${signal}: PGlite gateway was listening before the signal`);
    run.proc.kill(signal);
    exitCode = await Promise.race([run.exited, Bun.sleep(120_000).then(() => null)]);
    ok(exitCode !== null, `${signal}: the app exits instead of hanging`);
    ok(
      exitCode === expectedStatus,
      `${signal}: exit status is Effection's conventional ${expectedStatus}`,
      `got ${exitCode}`,
    );
  } finally {
    if (run.proc.exitCode === null) run.proc.kill("SIGKILL");
    await run.exited.catch(() => {});
  }
  await assertFullTeardown(signal, apiPort, dbPort);
}

async function modeLifecycle(taken: Set<number>): Promise<void> {
  const staged = await stage("lifecycle");
  try {
    await lifecycleStartupFailure(staged, taken);
    await lifecycleSignal(staged, taken, "SIGINT", 130);
    await lifecycleSignal(staged, taken, "SIGTERM", 143);
  } finally {
    await rm(staged.root, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------------------
// live mode — read-only Stagenet oracle
// ---------------------------------------------------------------------------

async function modeLive(taken: Set<number>): Promise<void> {
  section("live: read-only Stagenet acceptance");
  const staged = await stage("live");
  await verifyResolvedGraph(staged);

  const apiPort = await freeHighPort(taken);
  const dbPort = await freeHighPort(taken);
  console.log(`  ports: api=${apiPort} db=${dbPort}`);

  const run = runApp({ cwd: staged.runtimeDir, apiPort, dbPort });
  let html = "";
  try {
    await waitForReady(run, apiPort, 240_000);
    await waitFor(
      "the live decoded round reaches the HTML",
      async () => {
        html = (await fetchHome(apiPort)) ?? "";
        return /<p>Round: (?!waiting)/.test(html);
      },
      240_000,
    );
    console.log(html.split("\n").map((l) => `    ${l.trim()}`).join("\n"));

    ok(html.includes(`Network: ${EXPECTED.network}`), "live HTML reports network stagenet");
    ok(html.includes(`Contract: ${EXPECTED.contract}`), "live HTML reports the exact deployed contract");
    ok(
      html.includes(`Round: ${EXPECTED.liveRound}`),
      `live HTML reports the deployment transaction's initial round ${EXPECTED.liveRound}`,
      html,
    );
    ok(
      html.includes(`Midnight start block: ${EXPECTED.startBlockHeight}`),
      "live HTML reports the exact creation height",
    );
    ok(
      run.log().includes(`[MidnightClient] Using indexer ${EXPECTED.indexer}`),
      "the live run used the Stagenet indexer from the owning profile",
    );
    ok(
      run.log().includes(`Fetching blocks from ${EXPECTED.startBlockHeight}`),
      "the live run started at the exact deployment height, not at a tip or at 1",
    );
    ok(
      !/seed|mnemonic|faucet|private[- ]state/i.test(run.log()),
      "the live run printed no wallet, seed, faucet or private-state material",
    );
  } finally {
    run.proc.kill("SIGTERM");
    await run.exited.catch(() => {});
    await rm(staged.root, { recursive: true, force: true });
  }
  await assertFullTeardown("live", apiPort, dbPort);
}

// ---------------------------------------------------------------------------

const MODES = ["static", "deterministic", "lifecycle", "live", "ci", "all"] as const;
type Mode = (typeof MODES)[number];

async function main(): Promise<void> {
  const mode = (process.argv[2] ?? "ci") as Mode;
  if (!MODES.includes(mode)) {
    console.error(`Unknown mode "${mode}". Expected one of: ${MODES.join(", ")}`);
    process.exit(2);
  }

  const taken = new Set<number>();
  const started = Date.now();
  console.log(`single-file template controller — mode: ${mode}`);

  if (mode === "static" || mode === "ci" || mode === "all") await modeStatic();
  if (mode === "deterministic" || mode === "ci" || mode === "all") await modeDeterministic(taken);
  if (mode === "lifecycle" || mode === "ci" || mode === "all") await modeLifecycle(taken);
  if (mode === "live" || mode === "all") await modeLive(taken);

  const seconds = ((Date.now() - started) / 1000).toFixed(1);
  console.log(`\n${checks - failures.length}/${checks} checks passed in ${seconds}s`);
  if (failures.length > 0) {
    console.error(`\nFAILED (${failures.length}):`);
    for (const failure of failures) console.error(`  - ${failure}`);
    process.exit(1);
  }
}

if (import.meta.main) {
  await main();
}
