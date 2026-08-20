// MUST stay first: avail-js-sdk requires the CJS @polkadot build, and
// @polkadot/util reads the flag this sets while loading.
import "@effectstream/utils/polkadot-esm-cjs-warning";
import { SDK } from "avail-js-sdk";
import { DEFAULT_REQUEST_TIMEOUT_MS, fetchWithTimeout } from "../common/http.ts";
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
  /** Per-request deadline for light-client HTTP; see `common/http.ts`. */
  private readonly requestTimeoutMs: number;
  constructor(
    nodeUrl: string,
    lightClientUrl: string,
    requestTimeoutMs = DEFAULT_REQUEST_TIMEOUT_MS,
  ) {
    this.url = lightClientUrl ?? AVAIL_CLIENT_DEFAULT_URL;
    this.sdk = SDK.New(nodeUrl ?? AVAIL_NODE_DEFAULT_URL);
    this.requestTimeoutMs = requestTimeoutMs;
  }

  async getStatus(): Promise<AvailStatus> {
    const response = await fetchWithTimeout(
      `${this.url}/v2/status`,
      {},
      "Avail v2/status",
      this.requestTimeoutMs,
    );
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
    // Deliberately does NOT await `this.sdk`. The height comes from the light
    // client below; the websocket SDK was only needed by the commented-out
    // `api.rpc.chain.getHeader()` call, and awaiting it here reintroduced an
    // unbounded wait on the sync path — if the node's websocket never connects,
    // this never returns and the chain stalls silently. That is the exact
    // failure `requestTimeoutMs` exists to prevent.
    // Block from avail node is slightly above the light client
    // const header = await (await this.sdk).client.api.rpc.chain.getHeader();
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

    const response = await fetchWithTimeout(
      `${this.url}/v2/blocks/${height}/header`,
      {},
      `Avail v2/blocks/${height}/header`,
      this.requestTimeoutMs,
    );
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

    const response = await fetchWithTimeout(
      `${this.url}/v2/blocks/${height}/data`,
      {},
      `Avail v2/blocks/${height}/data`,
      this.requestTimeoutMs,
    );
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
