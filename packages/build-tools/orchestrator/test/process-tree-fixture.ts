import * as fs from "node:fs";
import * as net from "node:net";

const mode = process.argv[2];
const port = Number(process.argv[3]);

if (!Number.isInteger(port) || port <= 10000) {
  throw new Error(`fixture requires a port above 10000, received ${process.argv[3]}`);
}

if (mode === "listener" || mode === "stubborn-listener" || mode === "signal-listener") {
  const server = net.createServer((socket) => socket.end());
  server.listen(port, "127.0.0.1");
  if (mode === "stubborn-listener") {
    process.on("SIGTERM", () => {});
  }
  if (mode === "signal-listener") {
    const signalLog = process.env.TEST_SIGNAL_LOG;
    if (!signalLog) throw new Error("signal-listener requires TEST_SIGNAL_LOG");
    process.on("SIGTERM", () => {
      fs.appendFileSync(signalLog, "SIGTERM\n");
      server.close(() => process.exit(0));
    });
  }
} else if (mode === "wrapper" || mode === "wrapper-stubborn") {
  const child = Bun.spawn(
    [
      process.execPath,
      import.meta.path,
      mode === "wrapper" ? "listener" : "stubborn-listener",
      String(port),
    ],
    { stdin: "ignore", stdout: "inherit", stderr: "inherit" },
  );
  await child.exited;
} else {
  throw new Error(`unknown fixture mode: ${mode}`);
}
