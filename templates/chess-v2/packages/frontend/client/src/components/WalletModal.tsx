import { useState } from "react";
import { Box, Button, Typography } from "@mui/material";
import { useWallet } from "../contexts/WalletContext.tsx";
import { Card } from "./Card.tsx";
import { SelectField } from "./SelectField.tsx";

const wallets = ["Local Wallet (Dev)", "Browser Wallet (MetaMask)"] as const;
type WalletType = typeof wallets[number];

export function WalletModal({ onClose }: { onClose: () => void }) {
  const { connectLocalWallet, connectBrowserWallet, isConnecting } = useWallet();
  const [selectedWallet, setSelectedWallet] = useState<WalletType>(wallets[0]);

  const handleConnect = async () => {
    if (selectedWallet === wallets[0]) {
      await connectLocalWallet();
    } else {
      await connectBrowserWallet();
    }
  };

  return (
    <Box
      sx={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(0,0,0,0.7)",
        backdropFilter: "blur(4px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 9999,
      }}
      onClick={onClose}
    >
      <Box onClick={(e) => e.stopPropagation()}>
        <Card blurred layout>
          <Typography variant="h2">Connect Wallet</Typography>
          <SelectField
            label="Select wallet"
            items={wallets}
            value={selectedWallet}
            onChange={(event: any) => setSelectedWallet(event.target.value)}
          />
          <Button onClick={handleConnect} disabled={isConnecting}>
            {isConnecting ? "Connecting..." : "Connect"}
          </Button>
        </Card>
      </Box>
    </Box>
  );
}
