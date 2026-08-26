import { expect, test } from "bun:test";
import net from "node:net";

async function expectPortClosed(port: number): Promise<void> {
  await expect(new Promise<void>((resolve, reject) => {
    const socket = net.connect({ host: "127.0.0.1", port });
    socket.once("connect", () => {
      socket.destroy();
      resolve();
    });
    socket.once("error", reject);
  })).rejects.toMatchObject({ code: "ECONNREFUSED" });
}

test("single-file SIGTERM drains the runtime pool before explicit forced PGlite close", async () => {
  const child = Bun.spawn([
    process.execPath,
    new URL("./fixtures/single-file-sigterm.ts", import.meta.url).pathname,
  ], {
    cwd: new URL("../../../..", import.meta.url).pathname,
    stdout: "pipe",
    stderr: "pipe",
  });

  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  const output = `${stdout}\n${stderr}`;

  expect(exitCode, output).toBe(0);
  expect(output).toContain("SINGLE_FILE_SEND_SIGTERM");
  expect(output).toContain("SINGLE_FILE_POOL_END");
  expect(output).toContain("SINGLE_FILE_EXIT_ZERO");

  const match = output.match(/database: server listening on port (\d+)/);
  if (!match) throw new Error(`No reported PGlite port in output:\n${output}`);
  const port = Number(match[1]);
  const gatewayCloseMarker = `SINGLE_FILE_SERVER_CLOSE:${port}`;
  expect(output).toContain(gatewayCloseMarker);
  expect(output.indexOf("SINGLE_FILE_POOL_END")).toBeLessThan(
    output.indexOf(gatewayCloseMarker),
  );
  await expectPortClosed(port);
}, 30_000);
