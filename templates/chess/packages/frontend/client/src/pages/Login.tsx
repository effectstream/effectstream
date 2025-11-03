import React, { useContext, useState } from "react";
import { Button, Typography } from "@mui/material";

import { AppContext } from "../main.tsx";
import type { MainController } from "../MainController.ts";
import { Card } from "../components/Card.tsx";
import { Layout } from "../layouts/Layout.tsx";
import { SelectField } from "../components/SelectField.tsx";

import { LocalWallet } from "@thirdweb-dev/wallets";
import { getChainByChainIdAsync } from "@thirdweb-dev/chains";

import { WalletMode } from "@effectstream/wallets";
import { paimaEngineConfig } from "../PaimaEngineConfig.ts";


const wallets = [
  "Guest",
  "EVM",
  "EVM Self-sequence",
  "Algorand",
  "Polkadot",
  "Cardano",
] as const;

type WalletType = typeof wallets[number];

async function getLocalWallet() {
  const chain = await getChainByChainIdAsync(paimaEngineConfig.paimaL2Chain.id);
  const wallet = new LocalWallet({ chain });
  await wallet.loadOrCreate({
    strategy: "encryptedJson",
    // note: no password. This is unsafe, since somebody with physical access to your computer can get your key
    // but it's just for chess so it's not a big deal
    password: "",
  });
  // connect the wallet to the application
  await wallet.connect();
  return await wallet.getSigner();
}

export const Login: React.FC = () => {
  const mainController: MainController = useContext(
    AppContext,
  ) as unknown as MainController;

  const [selectedWallet, setSelectedWallet] = useState<WalletType | undefined>(
    wallets[0],
  );
  const [walletMapping, setWalletMapping] = useState<
    undefined | Record<WalletType, { mode: WalletMode; connection?: any }>
  >(undefined);

  React.useEffect(() => {
    async function getWallets() {
      const localWallet = await getLocalWallet();
      setWalletMapping({
        "Guest": {
          mode: WalletMode.EvmEthers,
          connection: {
            metadata: {
              name: "thirdweb.localwallet",
              displayName: "Local Wallet",
            },
            api: localWallet,
          },
        },
        EVM: { mode: WalletMode.EvmInjected },
        "EVM Self-sequence": {
          mode: WalletMode.EvmInjected,
        },
        Cardano: { mode: WalletMode.Cardano },
        Polkadot: { mode: WalletMode.Polkadot },
        Algorand: { mode: WalletMode.Algorand },
      });
    }
    getWallets();
  }, []);

  return (
    <Layout small navbar={false}>
      <Card blurred layout>
        <Typography variant="h2">Login</Typography>
        <SelectField
          label="Please, select your wallet"
          items={wallets}
          value={selectedWallet}
          onChange={(event: any) => {
            const wallet = event.target.value as WalletType;
            if (wallet === wallets[2]) { // "EVM Self-sequence"
              paimaEngineConfig.preferBatchedMode = false;
            } else {
              paimaEngineConfig.preferBatchedMode = true;
            }
            setSelectedWallet(wallet);
          }}
        />
        <Button
          disabled={!selectedWallet}
          onClick={() =>
            mainController.connectWallet(
              walletMapping?.[selectedWallet as WalletType],
            )}
        >
          Connect
        </Button>
      </Card>
    </Layout>
  );
};
