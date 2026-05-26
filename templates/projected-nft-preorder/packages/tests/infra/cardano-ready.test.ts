import { assert } from "../helpers.ts";

export async function cardanoReadyTest(): Promise<void> {
  await assert("YACI DevKit admin API is reachable", async () => {
    const res = await fetch("http://localhost:10000/local-cluster/api/admin/devnet");
    return res.ok;
  });

  await assert("Dolos MiniBF (Blockfrost) is reachable", async () => {
    const res = await fetch("http://localhost:3000/blocks/latest");
    return res.ok;
  });

  await assert("Dolos gRPC is reachable", async () => {
    const net = await import("node:net");
    return new Promise<boolean>((resolve) => {
      const socket = net.createConnection({ host: "127.0.0.1", port: 50051 }, () => {
        socket.destroy();
        resolve(true);
      });
      socket.on("error", () => resolve(false));
      socket.setTimeout(5000, () => { socket.destroy(); resolve(false); });
    });
  });
}
