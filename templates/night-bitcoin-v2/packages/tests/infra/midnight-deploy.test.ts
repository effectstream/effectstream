import fs from "fs";
import { assert } from "../helpers.ts";
import {
  getContractAddressPath,
  listContractNames,
} from "./midnight-utils.ts";

export async function midnightDeployTest() {
  for (const name of listContractNames()) {
    await assert(`Midnight contract "${name}" address file exists`, async () => {
      const found = getContractAddressPath(name);
      if (!found) return false;
      const json = JSON.parse(fs.readFileSync(found, "utf-8"));
      return typeof json.contractAddress === "string" && json.contractAddress.length > 0;
    });
  }
}
