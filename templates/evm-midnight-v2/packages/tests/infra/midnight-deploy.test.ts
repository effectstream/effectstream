import { assert } from "../helpers.ts";
import path from "path";
import fs from "fs";
import { getContractAddressPath } from "./midnight-utils.ts";

export async function midnightDeployTest() {
  await assert("Midnight contract address file exists", async () => {
    const found = getContractAddressPath();
    if (!found) return false;
    const json = JSON.parse(fs.readFileSync(found, "utf-8"));
    return !!json.contractAddress;
  });
}
