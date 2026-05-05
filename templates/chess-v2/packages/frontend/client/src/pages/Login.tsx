import React from "react";
import { Button, Typography } from "@mui/material";
import { Card } from "../components/Card.tsx";
import { Layout } from "../layouts/Layout.tsx";
import { SelectField } from "../components/SelectField.tsx";
import { useWallet } from "../contexts/WalletContext.tsx";
import { useNavigate } from "react-router-dom";
import { useState } from "react";

const wallets = ["Local Wallet (Dev)", "Browser Wallet (MetaMask)"] as const;
type WalletType = typeof wallets[number];

export const Login: React.FC = () => {
  const { connectLocalWallet, connectBrowserWallet, isConnecting } = useWallet();
  const navigate = useNavigate();
  const [selectedWallet, setSelectedWallet] = useState<WalletType>(wallets[0]);

  const handleConnect = async () => {
    try {
      if (selectedWallet === wallets[0]) {
        await connectLocalWallet();
      } else {
        await connectBrowserWallet();
      }
      navigate("/");
    } catch (err) {
      console.error("Connection failed:", err);
    }
  };

  return (
    <Layout small navbar={false}>
      <Card blurred layout>
        <Typography variant="h2">Login</Typography>
        <SelectField
          label="Select your wallet"
          items={wallets}
          value={selectedWallet}
          onChange={(event: any) => setSelectedWallet(event.target.value)}
        />
        <Button onClick={handleConnect} disabled={isConnecting}>
          {isConnecting ? "Connecting..." : "Connect"}
        </Button>
      </Card>
    </Layout>
  );
};
