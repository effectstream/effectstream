import type { PoolClient } from 'pg';

import { doLog, ENV } from '@paima/utils';
import type { CdeErc721TransferDatum } from './types.js';
import {
  cdeErc721BurnInsert,
  cdeErc721Delete,
  cdeErc721GetOwner,
  cdeErc721InsertOwner,
  cdeErc721UpdateOwner,
  createScheduledData,
} from '@paima/db';
import type { SQLUpdate } from '@paima/db';

export default async function processErc721Datum(
  readonlyDBConn: PoolClient,
  cdeDatum: CdeErc721TransferDatum,
  inPresync: boolean
): Promise<SQLUpdate[]> {
  const cdeName = cdeDatum.cdeName;
  const { to, tokenId, from } = cdeDatum.payload;
  const toAddr = to.toLowerCase();

  const isBurn = Boolean(toAddr.toLowerCase().match(/^0x0+(dead)?$/g));

  const updateList: SQLUpdate[] = [];
  try {
    const ownerRow = await cdeErc721GetOwner.run(
      { cde_name: cdeName, token_id: tokenId },
      readonlyDBConn
    );
    const newOwnerData = { cde_name: cdeName, token_id: tokenId, nft_owner: toAddr };
    if (ownerRow.length > 0) {
      if (isBurn) {
        if (cdeDatum.burnScheduledPrefix) {
          const scheduledInputData = `${cdeDatum.burnScheduledPrefix}|${ownerRow[0].nft_owner}|${tokenId}`;

          const scheduledBlockHeight = inPresync
            ? ENV.SM_START_BLOCKHEIGHT + 1
            : cdeDatum.blockNumber;

          updateList.push(
            createScheduledData(
              scheduledInputData,
              { blockHeight: scheduledBlockHeight },
              {
                cdeName: cdeDatum.cdeName,
                txHash: cdeDatum.transactionHash,
                caip2: cdeDatum.caip2,
                fromAddress: from.toLowerCase(),
                contractAddress: cdeDatum.contractAddress.toLowerCase(),
              }
            )
          );
        }

        // we do this to keep track of the owner before the asset is sent to the
        // burn address
        updateList.push([
          cdeErc721BurnInsert,
          { cde_name: cdeName, token_id: tokenId, nft_owner: ownerRow[0].nft_owner },
        ]);
        updateList.push([cdeErc721Delete, { cde_name: cdeName, token_id: tokenId }]);
      } else {
        updateList.push([cdeErc721UpdateOwner, newOwnerData]);
      }
    } else {
      updateList.push([cdeErc721InsertOwner, newOwnerData]);
    }
  } catch (err) {
    doLog(`[paima-sm] error while processing erc721 datum: ${err}`);
    return [];
  }

  return updateList;
}
