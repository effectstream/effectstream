export type AvailBlockHeader = {
  hash: `0x${string}`;
  parent_hash: `0x${string}`;
  number: number;
  state_root: `0x${string}`;
  extrinsics_root: `0x${string}`;
  extension: {
    rows: number;
    cols: number;
    data_root: `0x${string}`;
    commitments: string[];
    app_lookup: {
      size: number;
      index: {
        appId: number;
        start: number;
      }[];
    };
  };
  received_at: number;
};

export type AvailBlockDataItem = {
  block_number: number;
  data_transactions: {
    data: string; // BASE64 encoded data
    extrinsic: string;
  }[];
};

export type AvailBlock = {
  header: AvailBlockHeader;
  extrinsics: string[];
};
