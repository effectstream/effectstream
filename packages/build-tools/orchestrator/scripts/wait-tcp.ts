const port = Number(process.argv.at(-1));
if (!port || isNaN(port)) {
  console.error("Usage: bun wait-tcp.ts <port>");
  process.exit(1);
}

for (let i = 0; i < 120; i++) {
  try {
    const connected = await new Promise<boolean>((resolve) => {
      Bun.connect({
        hostname: "127.0.0.1",
        port,
        socket: {
          open(socket) { socket.end(); resolve(true); },
          data() {},
          error() { resolve(false); },
          close() {},
          connectError() { resolve(false); },
        },
      }).catch(() => resolve(false));
    });
    if (connected) process.exit(0);
  } catch {
    // fallthrough to retry
  }
  await Bun.sleep(500);
}

console.error(`Timed out waiting for tcp:${port}`);
process.exit(1);
