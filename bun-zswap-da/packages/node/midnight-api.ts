import { MidnightBech32m } from "@midnight-ntwrk/wallet-sdk-address-format";
import { CompiledContract } from "@midnight-ntwrk/compact-js";
import { setNetworkId } from "@midnight-ntwrk/midnight-js-network-id";
import { OfferFilesContract, witnesses } from "../midnight-contracts/contract-offer-files/src/index.ts";
import { midnightNetworkConfig } from "@effectstream/midnight-contracts/midnight-env";
import { dirname } from "node:path";
import {
    findDeployedContract,
    type FoundContract,
} from "@midnight-ntwrk/midnight-js-contracts";
import {
    buildWalletAndWaitForFunds,
    configureMidnightNodeProviders,
} from "@effectstream/midnight-contracts";

import { midnightContract } from "./config.ts";

export let _contractInstance: any;
export let _walletResult: any;
export let _wallet2Bech32: string | null = null;


export async function getWalletInstance() {
    if (!_walletResult) {
        _walletResult = await getContractInstance();
    }
    return { walletResult: _walletResult, wallet2Bech32: _wallet2Bech32 };
}

export async function getContractInstance() {
    if (_contractInstance) {
        return _contractInstance;
    }

    setNetworkId(midnightNetworkConfig.id);

    const networkUrls = {
        indexer: midnightNetworkConfig.indexer,
        indexerWS: midnightNetworkConfig.indexerWS,
        node: midnightNetworkConfig.node,
        proofServer: midnightNetworkConfig.proofServer,
        id: midnightNetworkConfig.id,
    };

    const walletResult = await buildWalletAndWaitForFunds(
        networkUrls,
        midnightNetworkConfig.walletSeed ??
        "0000000000000000000000000000000000000000000000000000000000000001",
        midnightNetworkConfig.id,
    );
    _walletResult = walletResult;
    const addr = await walletResult.wallet.shielded.getAddress();
    _wallet2Bech32 = MidnightBech32m.encode(midnightNetworkConfig.id, addr)
        .asString();

    const providers = configureMidnightNodeProviders(
        walletResult.wallet,
        walletResult.zswapSecretKeys,
        walletResult.walletZswapSecretKeys,
        walletResult.dustSecretKey,
        walletResult.walletDustSecretKey,
        networkUrls,
        "offerFilesPrivateState",
        midnightContract!.zkConfigPath,
        walletResult.unshieldedKeystore,
    );

    const compiledContract = CompiledContract.make(
        "contract-offer-files",
        OfferFilesContract.Contract as any,
    ).pipe(
        CompiledContract.withWitnesses(witnesses as unknown as never),
        CompiledContract.withCompiledFileAssets(
        dirname(midnightContract!.zkConfigPath),
        ),
    );

    const contract = await findDeployedContract(
        providers,
        {
        contractAddress: midnightContract!.contractAddress,
        compiledContract: compiledContract as any,
        privateStateId: "offerFilesPrivateState",
        initialPrivateState: {},
        },
    ) as any;
    console.log("Contract joined successfully");
    _contractInstance = contract;
    return _contractInstance;
}
