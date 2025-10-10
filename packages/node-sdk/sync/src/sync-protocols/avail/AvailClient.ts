import { SDK } from "avail-js-sdk";
import type {
  AvailBlock,
  AvailBlockDataItem,
  AvailBlockHeader,
  AvailStatus,
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

  async getStatus(): Promise<AvailStatus> {
    const response = await fetch(`${this.url}/v2/status`);
    if (!response.ok) {
      throw new Error(
        `Failed to get status from light client, status: ${response.status}`,
      );
    }
    const status: AvailStatus = await response.json();
    if (!status) {
      throw new Error(`Failed to get status from light client, no status found`);
    }
    return status;
  }

  async getLatestBlockHeight(): Promise<number> {
    const api = (await this.sdk).client.api;
    // Block from avail node is slightly above the light client
    // const header = await api.rpc.chain.getHeader();
    const status: AvailStatus = await this.getStatus();

    // If the available field is present, this is the real latest block 
    // synced by the light client for the app-id
    // otherwise the app id is yet not available.
    if (status.blocks.available) {
      return status.blocks.available.last;
    } else {
      return status.blocks.latest - 1;
    }
  }

  async getBlockFromHash(hash: string): Promise<AvailBlock> {
    const block = await (await this.sdk).client.api.rpc.chain.getBlock(hash);
    return {
      header: block.block.header as unknown as AvailBlockHeader,
      extrinsics: block.block.extrinsics as unknown as string[],
    };
  }

  async getBlockHeaderFromHeight(height: number): Promise<AvailBlockHeader> {
    const status = await this.getStatus();
    if (!status.blocks.available || height < status.blocks.available.first) {
      // This is before the app is deployed; return a dummy header
      // At this point in time, the app is still not deployed
      return { 
        hash: "0x" + String(height) as `0x${string}`,
        parent_hash: "0x0",
        number: height,
        state_root: "0x0",
        extrinsics_root: "0x0",
        extension: {
          rows: 0,
          cols: 0,
          data_root: "0x0",
          commitments: [],
          app_lookup: {
            size: 0,
            index: [],
          },
        },
        received_at: 0,
      }
    }

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
    const status = await this.getStatus();
    if (!status.blocks.available || height < status.blocks.available.first) {
      // The app has no data or has not been deployed yet
      // So we return a dummy empty data item
      return { block_number: height, data_transactions: [] }
    }

    const response = await fetch(`${this.url}/v2/blocks/${height}/data`);
    if (!response.ok) {
      throw new Error(
        `Failed to get block data from height ${height}, status: ${response.status}`,
      );
    }
    const blockData = await response.json() as AvailBlockDataItem;
    if (!blockData) {
      throw new Error(
        `Failed to get block data from height ${height}, no data found`,
      );
    }
    return blockData;
  }
}
