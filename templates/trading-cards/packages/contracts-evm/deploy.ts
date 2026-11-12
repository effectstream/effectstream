import { createHardhatRuntimeEnvironment } from "hardhat/hre";
import * as config from "./hardhat.config.ts";
import EffectstreamL2Module from "./ignition/modules/effectstreamL2.ts";
import AccountNftModule from "./ignition/modules/accountNft.ts";
import TradeNftModule from "./ignition/modules/tradeNft.ts";
import type { buildModule } from "@nomicfoundation/ignition-core";

const __dirname: any = import.meta.dirname;

type Deployment = {
  module: ReturnType<typeof buildModule>;
  network: string;
  parameters?: Record<string, Record<string, any>>;
};

// This is the list of contracts to deploy.
// Add or remove contracts as needed.
//
// NOTE on the v1 `extensions.yml` (the 4 primitives). The original @paima game
// declared 4 chain primitives: 2 ERC721s (account + trade NFT, deployed below),
// a generic ERC721 `Transfer` watcher on the trade NFT, and a generic
// `GenericPayment.Pay(uint256,address,string)` watcher for buying card packs.
// The modern engine has NO generic custom-event primitive (`PrimitiveTypeEVMGeneric`
// is commented out in @effectstream/sm/builtin), so:
//   - the two ERC721 Transfer watchers collapse into the two built-in ERC721
//     ownership primitives wired in packages/node/config.dev.ts, and
//   - card-pack purchase is modeled as an L2 action (`buyCardPack`) rather than
//     a watched GenericPayment event (the same pragmatic move nft-lvlup used).
// Hence we deploy EffectstreamL2 + 2× AnnotatedMintNft and NO GenericPayment.
const myDeployments: Deployment[] = [
  {
    module: EffectstreamL2Module,
    network: "evmMainHttp",
    parameters: {
      EffectstreamL2Module: {
        owner: "0xEFfE522D441d971dDC7153439a7d10235Ae6301f",
        fee: 0,
      },
    },
  },
  {
    module: AccountNftModule,
    network: "evmMainHttp",
    parameters: {
      AccountNft: {
        name: "Trading Cards Account",
        ticker: "TCA",
      },
    },
  },
  {
    module: TradeNftModule,
    network: "evmMainHttp",
    parameters: {
      TradeNft: {
        name: "Trading Cards Trade NFT",
        ticker: "TCT",
      },
    },
  },
] as const;

/**
 * Deploy the contracts to the network.
 */
export async function deploy(): Promise<void> {
  const hre = await createHardhatRuntimeEnvironment(config.default, __dirname);
  const messages: string[] = [];
  for (const deployment of myDeployments) {
    const network = await hre.network.connect(deployment.network);
    const result = await (network as any).ignition.deploy(
      deployment.module,
      deployment.parameters ? { parameters: deployment.parameters } : undefined,
    );
    messages.push(
      `${deployment.module.id.substring(0, 16).padEnd(16)} @ ${
        deployment.network.substring(0, 16).padEnd(16)
      } deployed to ${result.contract.address}`,
    );
  }
  console.log("Deployed contracts:\n", messages.join("\n"));
  // Wait for a block to be minted on the slowest chain.
  await new Promise((r) => setTimeout(r, 1000 * 2));
}

if (import.meta.main) {
  await deploy();
}
