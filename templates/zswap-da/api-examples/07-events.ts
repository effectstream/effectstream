// 07-events.ts — Stream real-time offer lifecycle events via SSE.
// Runs until Ctrl+C. Not included in run-all.ts (it never exits).
// bun run api-examples/07-events.ts

import { config, header } from "./config.ts";

header("SSE Event Stream");
console.log(`Connecting to ${config.nodeUrl}/api/events  (Ctrl+C to stop)\n`);

const res = await fetch(`${config.nodeUrl}/api/events`);
if (!res.ok || !res.body) {
  console.error(`Failed to connect: ${res.status}`);
  process.exit(1);
}

const reader = res.body.getReader();
const decoder = new TextDecoder();
let buffer = "";

while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  buffer += decoder.decode(value, { stream: true });

  const lines = buffer.split("\n");
  buffer = lines.pop() ?? "";

  for (const line of lines) {
    if (line.startsWith("data: ")) {
      try {
        const event = JSON.parse(line.slice(6));
        const ts = new Date(event.timestamp).toISOString().slice(11, 23);
        const type = event.type?.padEnd(18) ?? "unknown";
        let detail = "";
        switch (event.type) {
          case "offer_indexed":
            detail = `id=${event.offerId}  celestia=#${event.celestiaHeight}`;
            break;
          case "offer_consumed":
            detail = `id=${event.offerId}  nullifier=${String(event.nullifier).slice(0, 16)}…`;
            break;
          case "offer_expired":
            detail = `id=${event.offerId}`;
            break;
          case "offer_rejected":
            detail = `code=${event.code}  celestia=#${event.celestiaHeight}`;
            break;
          case "token_minted":
            detail = `${event.name}  color=${String(event.color).slice(0, 16)}…`;
            break;
          default:
            detail = JSON.stringify(event);
        }
        console.log(`[${ts}] ${type}  ${detail}`);
      } catch {
        // heartbeat comment line or malformed — skip
      }
    }
  }
}
