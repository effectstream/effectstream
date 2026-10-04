#!/usr/bin/env bun
// Bridge CLI. From the template root:
//   bun run bridge:to-midnight --amount 10 --recipient mn_shield-addr_undeployed1…
//   bun run bridge:to-midnight --amount 10 --account <64-hex Midnight contract address>
//   bun run bridge:to-solana   --amount 4  --recipient <base58 Solana pubkey>
//   bun run bridge:status      [--id s2m:0] [--watch]
// Common options: --mode local|live (default local, or BRIDGE_MODE), --api <url>
// (default http://localhost:9999), --timeout <s>, --no-wait.
//
// Arguments are validated BEFORE any module that talks to a chain is even
// loaded (commands.ts is imported only after parsing succeeded). Exit codes:
// 0 ok, 2 bad arguments, 1 any other failure.
import { CliArgError, parseStatusArgs, parseToMidnightArgs, parseToSolanaArgs } from "./args.ts";

const USAGE = `usage:
  bridge:to-midnight --amount <tokens> --recipient <mn_shield-addr_…> [--keypair <path>]
  bridge:to-midnight --amount <tokens> --account <64-hex contract address> [--keypair <path>]
  bridge:to-solana   --amount <tokens> --recipient <base58 pubkey> [--seed-file <path>]
  bridge:status      [--id <s2m:n|m2s:n>] [--direction s2m|m2s] [--status observed|submitted|completed|undeliverable] [--watch]
common: [--mode local|live] [--api <url>] [--timeout <seconds>] [--no-wait]`;

async function main(argv: string[]): Promise<number> {
  const [command, ...rest] = argv;
  try {
    switch (command) {
      case "to-midnight": {
        const args = parseToMidnightArgs(rest);
        const { toMidnight } = await import("./commands.ts");
        await toMidnight(args);
        return 0;
      }
      case "to-solana": {
        const args = parseToSolanaArgs(rest);
        const { toSolana } = await import("./commands.ts");
        await toSolana(args);
        return 0;
      }
      case "status": {
        const args = parseStatusArgs(rest);
        const { status } = await import("./commands.ts");
        await status(args);
        return 0;
      }
      default:
        console.error(command ? `unknown command "${command}"\n${USAGE}` : USAGE);
        return 2;
    }
  } catch (e) {
    if (e instanceof CliArgError) {
      console.error(`error: ${e.message}\n${USAGE}`);
      return 2;
    }
    console.error(`error: ${e instanceof Error ? e.message : String(e)}`);
    return 1;
  }
}

if (import.meta.main) {
  process.exit(await main(process.argv.slice(2)));
}

export { main };
