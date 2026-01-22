import {
  Transaction as LedgerV6Transaction,
} from "@midnight-ntwrk/ledger-v6";
import {
  SucceedEntirely,
  FailFallible,
  FailEntirely,
  SegmentSuccess,
  SegmentFail,
} from "@midnight-ntwrk/midnight-js-types";

const fromHex = (hex: string): Uint8Array => {
  const cleanHex = hex.startsWith("0x") ? hex.slice(2) : hex;
  const match = cleanHex.match(/.{1,2}/g);
  return new Uint8Array(match ? match.map((byte) => parseInt(byte, 16)) : []);
};

export const pollTxData = async (
  txId: string, 
  indexerApiUrl: string, 
  logPrefix: string = "midnight-utils.ts"
): Promise<any> => {
  const query = `
    query ($hash: HexEncoded!) {
      transactions(offset: { hash: $hash }) {
        id
        protocolVersion
        raw
        hash
        unshieldedCreatedOutputs {
          owner
          intentHash
          tokenType
          value
        }
        unshieldedSpentOutputs {
          owner
          intentHash
          tokenType
          value
        }
        block {
          height
          hash
          author
          timestamp
        }
        ... on RegularTransaction {
          identifiers
          fees {
            estimatedFees
            paidFees
          }
          transactionResult {
            status
            segments {
              id
              success
            }
          }
        }
      }
    }
  `;

  console.log(` ${logPrefix}: Starting custom pollTxData for`, txId);
  while (true) {
    try {
      const response = await fetch(indexerApiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query,
          variables: { hash: txId }
        })
      });
      const result = await response.json();
      if (result.data?.transactions?.length > 0) {
        const transaction = result.data.transactions[0];
        console.log(` ${logPrefix}: custom pollTxData found transaction`, transaction);
        
        return {
          tx: LedgerV6Transaction.deserialize('signature', 'proof', 'binding', fromHex(transaction.raw)),
          status: transaction.transactionResult.status === 'SUCCESS' ? SucceedEntirely : (transaction.transactionResult.status === 'PARTIAL_SUCCESS' ? FailFallible : FailEntirely),
          txId,
          txHash: transaction.hash,
          identifiers: transaction.identifiers,
          blockHeight: transaction.block.height,
          blockHash: transaction.block.hash,
          blockTimestamp: transaction.block.timestamp,
          blockAuthor: transaction.block.author,
          indexerId: parseInt(transaction.id),
          protocolVersion: transaction.protocolVersion,
          fees: {
            paidFees: transaction.fees.paidFees,
            estimatedFees: transaction.fees.estimatedFees
          },
          unshielded: {
             created: (transaction.unshieldedCreatedOutputs ?? []).map((u: any) => ({...u, value: BigInt(u.value)})),
             spent: (transaction.unshieldedSpentOutputs ?? []).map((u: any) => ({...u, value: BigInt(u.value)}))
          },
          segmentStatusMap: transaction.transactionResult.segments ? new Map(transaction.transactionResult.segments.map((s: any) => [s.id, s.success ? SegmentSuccess : SegmentFail])) : undefined
        };
      }
    } catch (e) {
      console.error(` ${logPrefix}: Error polling indexer:`, e);
    }
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
};

export const wrapPublicDataProvider = (provider: any, indexerApiUrl: string, logPrefix: string) => {
  const wrapOffset = (offset: any) => {
    if (offset && typeof offset === 'object' && Object.keys(offset).length === 0) {
      return undefined;
    }
    return offset;
  };

  return {
    ...provider,
    queryContractState: async (address: string, offset?: any) => {
      console.log(` ${logPrefix}: queryContractState called`, { address, offset });
      const result = await provider.queryContractState(address, wrapOffset(offset));
      console.log(` ${logPrefix}: queryContractState result`, result);
      return result;
    },
    watchForTxData: (txId: string) => pollTxData(txId, indexerApiUrl, logPrefix),
    subscribeContractActions: (address: string, offset?: any) =>
      provider.subscribeContractActions(address, wrapOffset(offset)),
    subscribeContractState: (address: string, offset?: any) =>
      provider.subscribeContractState(address, wrapOffset(offset)),
  };
};
