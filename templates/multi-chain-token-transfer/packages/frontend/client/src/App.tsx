import { useState, useEffect } from "react";
import "./App.css";
import * as paima from "./paima.ts";

function App() {
  const [evmWallet, setEvmWallet] = useState<any>(null);
  const [evmClient, setEvmClient] = useState<any>(null);
  const [midnightWallet, setMidnightWallet] = useState<any>(null);

  const [loading, setLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState("");

  const [evmAddress, setEvmAddress] = useState("");
  const [midnightAddress, setMidnightAddress] = useState("");
  const [balance, setBalance] = useState("N/A");
  const [midnightBalance, setMidnightBalance] = useState("N/A");
  const [midnightContract, setMidnightContract] = useState<any>(null);

  const [mintAmount, setMintAmount] = useState("");
  const [transferToMidnightAmount, setTransferToMidnightAmount] = useState("");

  const [midnightMintAmount, setMidnightMintAmount] = useState("");
  const [transferToEvmAmount, setTransferToEvmAmount] = useState("");

  const [transferToAddress, setTransferToAddress] = useState(
    "0xa0Ee7A142d267C1f36714E4a8F75612F20a79720"
  );
  const [transferAmount, setTransferAmount] = useState("");

  const [batchTransferToAddress, setBatchTransferToAddress] = useState(
    "0xa0Ee7A142d267C1f36714E4a8F75612F20a79720"
  );
  const [batchTransferIds, setBatchTransferIds] = useState("1,2");
  const [batchTransferAmounts, setBatchTransferAmounts] = useState("1,1");

  const [multiChainTokenData, setMultiChainTokenData] = useState<any[]>([]);
  const [erc721Data, setErc721Data] = useState<any>(null);

  useEffect(() => {
    fetchMultiChainTokenData();
    fetchErc721Data();
  }, []);

  useEffect(() => {
    if (evmWallet) {
      fetchBalance();
      fetchMultiChainTokenData();
    }
    if (midnightWallet) {
      fetchMidnightBalance();
    }
  }, [evmWallet, midnightWallet]);

  const withLoader = async (message: string, action: () => Promise<void>) => {
    setLoadingMessage(message);
    setLoading(true);
    try {
      await action();
    } catch (error) {
      console.error(error);
      alert("An error occurred. Check the console for details.");
    } finally {
      setLoading(false);
      setLoadingMessage("");
    }
  };

  const handleEvmLogin = async () => {
    await withLoader("Connecting EVM Wallet...", async () => {
      const { wallet, client } = await paima.loginEVM();
      setEvmWallet(wallet);
      setEvmClient(client);
      setEvmAddress(wallet.walletAddress);
    });
  };

  const handleMidnightLogin = async () => {
    await withLoader("Connecting Midnight Wallet...", async () => {
      const { wallet, addr, contract } = await paima.loginMidnight();
      setMidnightWallet(wallet);
      setMidnightContract(contract);
      setMidnightAddress(addr);
      fetchMidnightBalance();
    });
  };

  const fetchBalance = async () => {
    await withLoader("Fetching EVM balance...", async () => {
      if (evmWallet) {
        const balance = await paima.evm_balanceOf(evmWallet.walletAddress, 1n);
        setBalance(String(balance));
      }
    });
  };

  const fetchMidnightBalance = async () => {
    await withLoader("Fetching Midnight balance...", async () => {
      if (midnightWallet && midnightContract) {
        const balance = await paima.midnight_balanceOf(
          midnightContract,
          midnightAddress
        );
        setMidnightBalance(String(balance));
      }
    });
  };

  const [popup, setPopup] = useState<{ message: string; visible: boolean }>({
    message: "",
    visible: false,
  });

  const showPopup = (message: string) => {
    setPopup({ message, visible: true });
  };

  const closePopup = () => {
    setPopup({ message: "", visible: false });
  };

  const mintTokens = async () => {
    await withLoader("Minting EVM tokens...", async () => {
      if (evmWallet && evmClient && mintAmount) {
        await paima.evm_mint(evmClient, evmWallet, BigInt(mintAmount));
      } else {
        alert("Please connect wallet and enter an amount.");
      }
    });
  };

  const mintMidnightTokens = async () => {
    await withLoader("Minting Midnight tokens...", async () => {
      if (midnightWallet && midnightContract && midnightMintAmount) {
        await paima.midnight_mint(
          midnightContract,
          midnightAddress,
          BigInt(midnightMintAmount)
        );
      } else {
        alert("Please connect wallet and enter an amount.");
      }
    });
  };

  const transferToMidnight = async () => {
    await withLoader("Transferring to Midnight...", async () => {
      if (evmWallet && evmClient && transferToMidnightAmount) {
        const amount = BigInt(transferToMidnightAmount);
        await paima.evm_transferToMidnight(
          evmClient,
          evmWallet,
          BigInt(transferToMidnightAmount),
          midnightAddress as `0x${string}`
        );

        const currentBalance =
          !balance || balance === "N/A" || balance === "undefined"
            ? 0n
            : BigInt(balance);
        const currentMidnightBalance =
          !midnightBalance ||
          midnightBalance === "N/A" ||
          midnightBalance === "undefined"
            ? 0n
            : BigInt(midnightBalance);
        setBalance(String(currentBalance - amount));
        setMidnightBalance(String(currentMidnightBalance + amount));

        showPopup(
          `Successfully initiated transfer of ${amount} tokens to Midnight.`
        );
      } else {
        alert("Please connect wallet and enter an amount.");
      }
    });
  };

  const transferToEvm = async () => {
    await withLoader("Transferring to EVM...", async () => {
      if (midnightWallet && midnightContract && transferToEvmAmount) {
        const amount = BigInt(transferToEvmAmount);
        await paima.midnight_transferToEVM(
          midnightContract,
          midnightAddress,
          evmAddress,
          BigInt(transferToEvmAmount)
        );

        const currentMidnightBalance =
        !midnightBalance || midnightBalance === "N/A" || midnightBalance === "undefined" ? 0n : BigInt(midnightBalance);
        const currentBalance = !balance || balance === "N/A" || balance === "undefined" ? 0n : BigInt(balance);
        setMidnightBalance(String(currentMidnightBalance - amount));
        setBalance(String(currentBalance + amount));

        showPopup(
          `Successfully initiated transfer of ${amount} tokens to EVM.`
        );
      } else {
        alert("Please connect wallet and enter an amount.");
      }
    });
  };

  const writeToContractEVMERC1155 = async () => {
    await withLoader("Transferring EVM tokens...", async () => {
      if (evmWallet && evmClient && transferAmount && transferToAddress) {
        await paima.evm_safeTransferFrom(
          evmClient,
          evmWallet,
          transferToAddress as `0x${string}`,
          transferAmount
        );
      } else {
        alert("Please connect wallet and fill all fields.");
      }
    });
  };

  const writeToContractEVMSafeBatchTransferFrom = async () => {
    await withLoader("Batch transferring EVM tokens...", async () => {
      if (
        evmWallet &&
        evmClient &&
        batchTransferToAddress &&
        batchTransferIds &&
        batchTransferAmounts
      ) {
        const ids = batchTransferIds.split(",").map((id) => BigInt(id.trim()));
        const amounts = batchTransferAmounts
          .split(",")
          .map((amount) => BigInt(amount.trim()));
        await paima.evm_safeBatchTransferFrom(
          evmClient,
          evmWallet,
          batchTransferToAddress as `0x${string}`,
          ids,
          amounts
        );
      } else {
        alert("Please connect wallet and fill all fields.");
      }
    });
  };

  const fetchErc721Data = async () => {
    await withLoader("Fetching ERC721 data...", async () => {
      try {
        const response = await fetch("http://localhost:9999/api/erc721");
        if (!response.ok)
          throw new Error(`HTTP error! status: ${response.status}`);
        const data = await response.json();
        setErc721Data(data);
      } catch (error) {
        console.error("Failed to fetch ERC721 data:", error);
        setErc721Data("Failed to load data.");
      }
    });
  };

  const fetchMultiChainTokenData = async () => {
    await withLoader("Fetching network balances...", async () => {
      try {
        const response = await fetch(
          "http://127.0.0.1:9999/primitives/MULTI_CHAIN_TOKEN_EVM?limit=20"
        );
        if (!response.ok)
          throw new Error(`HTTP error! status: ${response.status}`);
        const result = await response.json();
        setMultiChainTokenData(result.data);
      } catch (error) {
        console.error("Failed to fetch multi chain token data:", error);
      }
    });
  };

  const getDustFromFaucet = async () => {
    await withLoader('Getting DUST from faucet...', async () => {
      if (midnightAddress) {
        try {
          const response = await fetch(`http://localhost:9999/api/faucet?address=${midnightAddress}`);
          if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Faucet request failed: ${response.status} ${response.statusText} - ${errorText}`);
          }
          showPopup('Successfully received DUST from faucet! Balance will update shortly.');
          setTimeout(() => {
            fetchMidnightBalance();
          }, 2000);
        } catch (error) {
          console.error('Failed to get DUST from faucet:', error);
          alert(`Failed to get DUST from faucet. Check the console for details.`);
        }
      } else {
        alert('Please connect Midnight wallet first.');
      }
    });
  };

  // TODO: Implement these functions
  const handleSwapMidnightToEvm = () => alert("Not implemented yet");
  const handleTransferMidnight = () => alert("Not implemented yet");

  return (
    <>
      {loading && (
        <div className="loader-overlay">
          <div className="loader-content">
            <div className="spinner"></div>
            <p>{loadingMessage}</p>
          </div>
        </div>
      )}
      {popup.visible && (
        <div className="popup-overlay">
          <div className="popup">
            <p>{popup.message}</p>
            <button type="button" onClick={closePopup}>
              Close
            </button>
          </div>
        </div>
      )}
      <div className="container">
        <header>
          <h1>Midnight / EVM Interoperability Bridge</h1>
        </header>

        <section className="wallet-info-bar">
          <div className="wallet-column">
            <h3>EVM Wallet</h3>
            <div className="wallet-status">
              <div className="wallet-status-left">
                <span className="icon">{evmAddress ? '✓' : '✗'}</span>
                <div className="wallet-details">
                  <strong>Status:</strong>
                  <span>{evmAddress ? 'Connected' : 'Not Connected'}</span>
                  <div className="address">{evmAddress}</div>
                </div>
              </div>
            </div>
            {evmAddress ? (
              <div className="token-balances">
                <span>
                  <strong>Balance:</strong> {balance} SWAP
                </span>
                <button
                  type="button"
                  onClick={fetchBalance}
                  className="secondary"
                >
                  Refresh
                </button>
              </div>
            ) : (
              <button
                type="button"
                className="evm-button"
                onClick={handleEvmLogin}
              >
                Connect EVM Wallet
              </button>
            )}
          </div>
          <div className="wallet-column">
            <h3>Midnight Wallet</h3>
            <div className="wallet-status">
              <div className="wallet-status-left">
                <span className="icon">{midnightAddress ? '✓' : '✗'}</span>
                <div className="wallet-details">
                  <strong>Status:</strong>
                  <span>
                    {midnightAddress ? 'Connected' : 'Not Connected'}
                  </span>
                  <div className="address">{midnightAddress}</div>
                </div>
              </div>
              {midnightAddress && (
                <button
                style={{ minWidth: '90px' }}
                  type="button"
                  onClick={getDustFromFaucet}
                  className="link-button"
                >
                  Get DUST from Faucet
                </button>
              )}
            </div>
            {midnightAddress ? (
              <div className="token-balances">
                <span>
                  <strong>Balance:</strong> {midnightBalance} SWAP
                </span>
                <button
                  type="button"
                  onClick={fetchMidnightBalance}
                  className="secondary"
                >
                  Refresh
                </button>
              </div>
            ) : (
              <button
                type="button"
                className="midnight-button"
                onClick={handleMidnightLogin}
              >
                Connect Lace (Midnight) Wallet
              </button>
            )}
          </div>
        </section>

        <div className="main-content container">
          <div className="chain-panel evm-panel">
            <h2>EVM Chain</h2>

            <div className="section">
              <h3>Mint Test Tokens (EVM)</h3>
              <label htmlFor="mint-amount-input">Amount to Mint:</label>
              <input
                type="number"
                id="mint-amount-input"
                placeholder="e.g., 100"
                value={mintAmount}
                onChange={(e) => setMintAmount(e.target.value)}
              />
              <button type="button" onClick={mintTokens}>
                Mint to EVM Wallet
              </button>
            </div>

            <div className="section">
              <h3>Swap: EVM -&gt; Midnight</h3>
              <label htmlFor="midnight-amount-input">Amount to Send:</label>
              <input
                type="number"
                id="midnight-amount-input"
                placeholder="e.g., 50"
                value={transferToMidnightAmount}
                onChange={(e) => setTransferToMidnightAmount(e.target.value)}
              />
              <label htmlFor="midnight-address-input">
                Destination Midnight Address:
              </label>
              <input
                type="text"
                id="midnight-address-input"
                placeholder="midnight1..."
                value={midnightAddress}
                onChange={(e) => setMidnightAddress(e.target.value)}
              />
              <button type="button" onClick={transferToMidnight}>
                Send to Midnight Bridge
              </button>
            </div>

            <div className="section" style={{ display: "none" }}>
              <h3>Transfer Tokens (EVM)</h3>
              <label htmlFor="to-address-input">Recipient EVM Address:</label>
              <input
                type="address"
                id="to-address-input"
                value={transferToAddress}
                onChange={(e) => setTransferToAddress(e.target.value)}
                placeholder="0x..."
              />
              <label htmlFor="amount-input">Amount to Transfer:</label>
              <input
                type="number"
                id="amount-input"
                placeholder="e.g., 25"
                value={transferAmount}
                onChange={(e) => setTransferAmount(e.target.value)}
              />
              <button type="button" onClick={writeToContractEVMERC1155}>
                Send EVM Tokens
              </button>
            </div>

            <div className="section" style={{ display: "none" }}>
              <h3>Batch Transfer Tokens (EVM)</h3>
              <label htmlFor="batch-to-address-input">
                Recipient EVM Address:
              </label>
              <input
                id="batch-to-address-input"
                type="address"
                value={batchTransferToAddress}
                onChange={(e) => setBatchTransferToAddress(e.target.value)}
                placeholder="To address"
              />
              <label htmlFor="batch-ids-input">
                Token IDs (comma-separated):
              </label>
              <input
                id="batch-ids-input"
                type="text"
                value={batchTransferIds}
                onChange={(e) => setBatchTransferIds(e.target.value)}
                placeholder="e.g., 1,2"
              />
              <label htmlFor="batch-amounts-input">
                Amounts (comma-separated):
              </label>
              <input
                id="batch-amounts-input"
                type="text"
                value={batchTransferAmounts}
                onChange={(e) => setBatchTransferAmounts(e.target.value)}
                placeholder="e.g., 1,1"
              />
              <button
                type="button"
                onClick={writeToContractEVMSafeBatchTransferFrom}
              >
                Safe Batch Transfer
              </button>
            </div>
          </div>

          <div className="divider"></div>

          <div className="chain-panel midnight-panel">
            <h2>Midnight Chain</h2>

            <div className="section">
              <h3>Mint Test Tokens (Midnight)</h3>
              <label htmlFor="midnight-mint-amount-input">
                Amount to Mint:
              </label>
              <input
                type="number"
                id="midnight-mint-amount-input"
                placeholder="e.g., 100"
                value={midnightMintAmount}
                onChange={(e) => setMidnightMintAmount(e.target.value)}
              />
              <button type="button" onClick={mintMidnightTokens}>
                Mint to Midnight Wallet
              </button>
            </div>

            <div className="section">
              <h3>Swap: Midnight -&gt; EVM</h3>
              <label htmlFor="swapMidnightAmount">Amount to Send:</label>
              <input
                type="number"
                id="swapMidnightAmount"
                placeholder="e.g., 50"
                value={transferToEvmAmount}
                onChange={(e) => setTransferToEvmAmount(e.target.value)}
              />
              <label htmlFor="evm-address-input">
                Destination EVM Address:
              </label>
              <input
                type="text"
                id="evm-address-input"
                placeholder="0x..."
                value={evmAddress}
                onChange={(e) => setEvmAddress(e.target.value)}
              />
              <button type="button" onClick={transferToEvm}>
                Send to EVM Bridge
              </button>
            </div>

            <div className="section" style={{ display: "none" }}>
              <h3>Transfer Tokens (Midnight)</h3>
              <label htmlFor="transferMidnightRecipient">
                Recipient Midnight Address:
              </label>
              <input
                type="text"
                id="transferMidnightRecipient"
                placeholder="midnight1..."
              />
              <label htmlFor="transferMidnightAmount">
                Amount to Transfer:
              </label>
              <input
                type="number"
                id="transferMidnightAmount"
                placeholder="e.g., 25"
              />
              <button type="button" onClick={handleTransferMidnight}>
                Send Midnight Tokens (NYI)
              </button>
            </div>
          </div>
        </div>

        <section className="all-balances-section container">
          <h2>Network Balances &amp; Activity</h2>
          <button type="button" onClick={fetchMultiChainTokenData}>
            Refresh Data
          </button>
          <div id="multi-chain-token-container">
            {multiChainTokenData.length > 0 ? (
              <table className="data-table balances-table">
                <thead>
                  <tr>
                    <th>Primitive Name</th>
                    <th>Token ID</th>
                    <th>Owner Address</th>
                    <th>Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {multiChainTokenData.map((item, index) => (
                    <tr key={index}>
                      <td>{item.primitive_name}</td>
                      <td>{item.token_id}</td>
                      <td>{item.owner_address}</td>
                      <td>{item.amount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p>No data available.</p>
            )}
          </div>
          <hr />
          <h3>Raw ERC721 Data</h3>
          <button type="button" onClick={fetchErc721Data}>
            Refresh ERC721 data
          </button>
          <pre
            id="erc721-data"
            style={{
              backgroundColor: "var(--input-bg)",
              padding: "10px",
              borderRadius: "5px",
            }}
          >
            {erc721Data ? JSON.stringify(erc721Data, null, 2) : "Loading..."}
          </pre>
        </section>
      </div>

      <footer>
        <p>© 2023 Bridge Solutions. Powered by Paima Engine</p>
      </footer>
    </>
  );
}

export default App;
