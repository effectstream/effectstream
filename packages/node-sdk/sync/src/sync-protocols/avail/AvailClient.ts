import { SDK } from "avail-js-sdk";
import type {
  AvailBlock,
  AvailBlockDataItem,
  AvailBlockHeader,
} from "./types.ts";

const AVAIL_CLIENT_DEFAULT_URL = "http://localhost:7007";
const AVAIL_NODE_DEFAULT_URL = "ws://localhost:9955/ws";

export class AvailClient {
  private readonly url: string;
  private readonly sdk: Promise<SDK>;
  constructor(nodeUrl: string, lightClientUrl: string) {
    this.url = lightClientUrl ?? AVAIL_CLIENT_DEFAULT_URL;
    this.sdk = SDK.New(nodeUrl ?? AVAIL_NODE_DEFAULT_URL);
  }

  async getBlockFromHash(hash: string): Promise<AvailBlock> {
    const block = await (await this.sdk).client.api.rpc.chain.getBlock(hash);
    return {
      header: block.block.header as unknown as AvailBlockHeader,
      extrinsics: block.block.extrinsics as unknown as string[],
    };
  }

  async getBlockHeaderFromHeight(height: number): Promise<AvailBlockHeader> {
    const response = await fetch(`${this.url}/v2/blocks/${height}/header`);
    if (!response.ok) {
      throw new Error(
        `Failed to get block header from height ${height}, status: ${response.status}`,
      );
    }
    const blockHeader = await response.json() as AvailBlockHeader;
    if (!blockHeader) {
      throw new Error(
        `Failed to get block header from height ${height}, no header found`,
      );
    }
    return blockHeader;
  }

  async getBlockDataFromHeight(height: number): Promise<AvailBlockDataItem> {
    const response = await fetch(`${this.url}/v2/blocks/${height}/data`);
    if (!response.ok) {
      throw new Error(
        `Failed to get block data from height ${height}, status: ${response.status}`,
      );
    }
    const blockData = await response.json() as AvailBlockDataItem;
    return blockData;
  }
}
