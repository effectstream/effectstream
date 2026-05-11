import { assert } from "../helpers.ts";

export async function cardanoReadyTest() {
  await assert("YACI Admin API responds", async () => {
    const res = await fetch(
      "http://localhost:10000/local-cluster/api/admin/devnet",
    );
    return res.ok;
  });

  await assert("Dolos MiniBF responds", async () => {
    const res = await fetch("http://localhost:3000/blocks/latest");
    return res.ok;
  });

  await assert("Dolos gRPC port is open", async () => {
    return new Promise<boolean>((resolve) => {
      const net = require("net");
      const socket = net.createConnection({ port: 50051, host: "localhost" });
      socket.on("connect", () => {
        socket.destroy();
        resolve(true);
      });
      socket.on("error", () => resolve(false));
      socket.setTimeout(5000, () => {
        socket.destroy();
        resolve(false);
      });
    });
  });
}
