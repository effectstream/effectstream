import { setNetworkId } from "@midnight-ntwrk/midnight-js-network-id";
import * as Rx from "rxjs";
import { NETWORK, SEEDS } from "./env.ts";
import { buildWallet } from "./wallet.ts";

setNetworkId(NETWORK.id as never);
const ctx = await buildWallet(NETWORK, SEEDS.batcher);
await new Promise((r) => setTimeout(r, 15000));
const state: any = await Rx.firstValueFrom(ctx.wallet.dust.state);
console.log("STATE KEYS:", Object.keys(state));
console.log("walletBalance:", typeof state.walletBalance === "function" ? String(state.walletBalance(new Date())) : "n/a");
const coins: any[] = state.availableCoins ?? [];
console.log("availableCoins:", coins.length);
for (const c of coins) {
  console.log("COIN KEYS:", Object.keys(c));
  console.log("COIN:", JSON.stringify(c, (_, v) => typeof v === "bigint" ? v.toString() : v)?.slice(0, 800));
}
await ctx.wallet.stop();
process.exit(0);
