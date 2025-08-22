import { useEffect, useMemo, useState } from "react";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { writeContract } from "viem/actions";
import { createPublicClient, createWalletClient, http } from "viem";
import { hardhat } from "viem/chains";
import { initialNFTSamples } from "../examples.ts";
import { useWallet } from "../contexts/WalletContext.tsx";
import {
  connectMidnightWallet,
  connectToContract,
  fetchCurrentCounterState,
  incrementCounterValue,
} from "../increment.ts";
import { take, timeout } from "rxjs/operators";
import { BATCHER_ENDPOINT } from "../config.ts";
import { erc721dev } from "@example/evm-contracts";

interface EVMWallet {
  privateKey: `0x${string}`;
  address: `0x${string}`;
}

interface MidnightWallet {
  address: string;
  connected: boolean;
  contractConnected: boolean;
  currentCounterValue: bigint | null;
  contractAddress: string | null;
}

interface ERC721Token {
  id: string;
  owner?: string;
  properties: Record<string, string | number>;
  isValid: boolean;
}

interface Notification {
  id: number;
  type: "success" | "error" | "info" | "warning";
  title: string;
  message: string;
}

interface PropertySuggestion {
  key: string;
  value: string;
  description: string;
}

// Property suggestions for easy addition - matched with initial token properties
const PROPERTY_SUGGESTIONS: PropertySuggestion[] = [
  {
    key: "streetAddress",
    value: "123 Main St",
    description: "Street address of the location",
  },
  { key: "zipCode", value: "12345", description: "Postal code" },
  { key: "city", value: "New York", description: "City name" },
  { key: "state", value: "NY", description: "State or region" },
  {
    key: "nearbyLandmark",
    value: "Famous Building",
    description: "Notable nearby landmark",
  },
  {
    key: "cityFoundingDate",
    value: "1800-01-01",
    description: "When the city was founded",
  },
  { key: "rarity", value: "rare", description: "Rarity level of the token" },
  { key: "tokenType", value: "Location Token", description: "Type of token" },
  { key: "condition", value: "mint", description: "Current condition" },
  { key: "color", value: "blue", description: "Primary color theme" },
];

// Random token names from landmarks and creative additions
const RANDOM_TOKEN_NAMES = [
  "Mystic Tower NFT",
  "Golden Gateway Token",
  "Crystal Palace Collectible",
  "Ancient Ruins NFT",
  "Starlight Bridge Token",
  "Diamond Peak Collectible",
  "Thunder Mountain NFT",
  "Emerald Valley Token",
  "Silver Falls Collectible",
  "Phoenix Temple NFT",
  "Dragon's Lair Token",
  "Celestial Garden Collectible",
  "Neon City NFT",
  "Quantum Portal Token",
  "Cyber Fortress Collectible",
  "Ocean Pearl NFT",
  "Desert Oasis Token",
  "Forest Crown Collectible",
  "Moon Base Alpha NFT",
  "Solar Flare Token",
  "Nebula Dreams Collectible",
  "Ice Crystal NFT",
  "Volcano Heart Token",
  "Rainbow Bridge Collectible",
];

const AddressType = {
  EVM: 0,
};

// Batcher helper functions
async function createSignedInput(
  gameInput: string,
  userAddress: string,
  signMessage: (message: string) => Promise<string>,
) {
  const timestamp = Date.now();
  const addressType = AddressType.EVM;

  function createMessageForBatcher(
    namespace: string | null,
    millisecondTimestamp: number,
    walletAddress: string,
    inputData: string,
  ): string {
    return ((namespace ?? "") + millisecondTimestamp + walletAddress +
      inputData)
      .replace(/[^a-zA-Z0-9]/g, "-")
      .toLocaleLowerCase();
  }

  const message = createMessageForBatcher(
    null,
    timestamp,
    userAddress,
    gameInput,
  );

  const signature = await signMessage(message);

  return {
    addressType,
    userAddress,
    userSignature: signature,
    gameInput,
    millisecondTimestamp: timestamp,
  };
}

async function sendInputToBatcher(batchedInput: any) {
  const response = await fetch(BATCHER_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(batchedInput),
  });

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  return await response.json();
}

async function postToBatcher(
  jsonArrayString: string,
  userAddress: string,
  signMessage: (message: string) => Promise<string>,
) {
  console.log("🚀 Creating signed input for:", jsonArrayString);
  const signedInput = await createSignedInput(
    jsonArrayString,
    userAddress,
    signMessage,
  );

  console.log("✅ Signed input created:", {
    ...signedInput,
    userSignature: signedInput.userSignature.slice(0, 10) + "...",
  });

  console.log("📤 Sending to batcher...");
  const result = await sendInputToBatcher(signedInput);

  console.log("🎉 Batcher response:", result);
  return result;
}

// API functions for fetching NFT data
// response example: [{"token_id":"111","owner":"","block_height":1395,"property_name":"Name","value":"Starlight Bridge Token","property_block_height":1395}]
const fetchNFTData = async (): Promise<{
  token_id: string;
  owner: string;
  block_height: number;
  property_name: string;
  value: string;
  property_block_height: number;
}[]> => {
  try {
    const response = await fetch("http://localhost:9999/api/erc721");
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    console.error("Failed to fetch NFT data:", error);
    throw error;
  }
};

const convertApiDataToTokens = (
  apiData: {
    token_id: string;
    owner: string;
    block_height: number;
    property_name: string;
    value: string;
    property_block_height: number;
  }[],
): ERC721Token[] => {
  return apiData.map((data) => ({
    id: data.token_id,
    owner: data.owner,
    properties: {
      [data.property_name]: data.value,
    },
    isValid: !!data.owner, // Token is valid if it has an owner
  }));
};

export function WalletDemo() {
  const {
    isConnected: walletConnected,
    address: walletAddress,
    signMessage,
    walletClient,
  } = useWallet();

  const [evmWallet, setEvmWallet] = useState<EVMWallet | null>(null);
  const [hardhatWalletClient, setHardhatWalletClient] = useState<any>(null);
  const [midnightWallet, setMidnightWallet] = useState<MidnightWallet | null>(
    null,
  );
  const [isConnectingMidnight, setIsConnectingMidnight] = useState(false);
  const [isIncrementingCounter, setIsIncrementingCounter] = useState(false);
  const [tokens, setTokens] = useState<ERC721Token[]>([]);
  const [selectedToken, setSelectedToken] = useState<string | null>(null);
  const [tokenName, setTokenName] = useState<string>("");
  const [isLoadingTokens, setIsLoadingTokens] = useState<boolean>(false);
  const [tokenIdInput, setTokenIdInput] = useState<string>("");
  const [createTokenId, setCreateTokenId] = useState<string>(
    Date.now().toString(),
  );
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [animatingTokens, setAnimatingTokens] = useState<Set<string>>(
    new Set(),
  );
  const [animatingProperties, setAnimatingProperties] = useState<Set<string>>(
    new Set(),
  );
  const [isCreatingToken, setIsCreatingToken] = useState(false);

  // ERC721 contract address - moved here to be accessible to both sections
  const erc721Address = "0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0";

  // Increment counter form state
  const [incrementForm, setIncrementForm] = useState({
    contractAddress: erc721Address,
    tokenId: "",
    propertyName: "Name",
    propertyValue:
      RANDOM_TOKEN_NAMES[Math.floor(Math.random() * RANDOM_TOKEN_NAMES.length)],
  });

  // Generate random token name
  const generateRandomTokenName = () => {
    const randomName =
      RANDOM_TOKEN_NAMES[Math.floor(Math.random() * RANDOM_TOKEN_NAMES.length)];
    setTokenName(randomName);
  };

  // Set random name on component mount
  useEffect(() => {
    generateRandomTokenName();
  }, []);

  // Fetch NFT data function
  const loadTokens = async () => {
    setIsLoadingTokens(true);
    try {
      const apiData = await fetchNFTData();
      const convertedTokens = convertApiDataToTokens(apiData);
      setTokens(convertedTokens);
    } catch (error) {
      console.error("Failed to load tokens:", error);
      showNotification(
        "error",
        "Failed to Load NFTs",
        "Could not fetch NFT data from the API endpoint",
      );
    } finally {
      setIsLoadingTokens(false);
    }
  };

  // Initial load and setup interval
  useEffect(() => {
    loadTokens(); // Initial load

    const interval = setInterval(() => {
      loadTokens(); // Refresh every 5 seconds
    }, 5000);

    return () => clearInterval(interval);
  }, []);

  // Update tokenId input when selected token changes
  useEffect(() => {
    if (selectedToken) {
      setTokenIdInput(selectedToken);
      setIncrementForm((prev) => ({
        ...prev,
        tokenId: selectedToken,
      }));
    }
  }, [selectedToken]);

  // Create hardhat wallet client when main wallet connects
  useEffect(() => {
    const createHardhatWalletClient = () => {
      if (
        walletConnected && walletAddress && typeof globalThis !== "undefined" &&
        (globalThis as any).ethereum
      ) {
        try {
          console.log(
            "🔗 [HARDHAT] Creating hardhat wallet client for:",
            walletAddress,
          );

          const hardhatClient = createWalletClient({
            account: walletAddress as `0x${string}`,
            chain: hardhat,
            transport: http("http://127.0.0.1:8545"), // Hardhat local node
          });

          setHardhatWalletClient(hardhatClient);
          console.log(
            "✅ [HARDHAT] Hardhat wallet client created successfully",
          );
        } catch (error) {
          console.error(
            "❌ [HARDHAT] Failed to create hardhat wallet client:",
            error,
          );
        }
      } else {
        setHardhatWalletClient(null);
      }
    };

    createHardhatWalletClient();
  }, [walletConnected, walletAddress]);

  // Removed property suggestion handler as we no longer add properties

  // Handle card selection
  const handleCardSelect = (tokenId: string) => {
    setSelectedToken(tokenId);
    // No notification for token selection to avoid spam
  };

  // Memoized property suggestions for each token (stable per token, filtered by missing properties)
  const tokenSuggestions = useMemo(() => {
    const suggestions: Record<string, PropertySuggestion[]> = {};
    tokens.forEach((token) => {
      // Get existing property keys for this token
      const existingKeys = Object.keys(token.properties);

      // Filter out properties that already exist
      const availableSuggestions = PROPERTY_SUGGESTIONS.filter(
        (suggestion) => !existingKeys.includes(suggestion.key),
      );

      // Create a deterministic but unique seed for each token
      const seed = parseInt(token.id) || 0;

      // Use the seed to create consistent "random" suggestions for each token
      const shuffled = [...availableSuggestions].sort((a, b) => {
        const aHash = (a.key + seed).split("").reduce(
          (acc, char) => acc + char.charCodeAt(0),
          0,
        );
        const bHash = (b.key + seed).split("").reduce(
          (acc, char) => acc + char.charCodeAt(0),
          0,
        );
        return (aHash % 1000) - (bHash % 1000);
      });

      suggestions[token.id] = shuffled.slice(0, 2);
    });
    return suggestions;
  }, [
    tokens.map((t) => `${t.id}:${Object.keys(t.properties).join(",")}`).join(
      "|",
    ),
  ]);

  const showNotification = (
    type: Notification["type"],
    title: string,
    message: string,
  ) => {
    const id = Date.now() + Math.random() * 1000000; // Add randomness to prevent collisions
    const notification: Notification = { id, type, title, message };
    setNotifications((prev) => [...prev, notification]);

    setTimeout(() => {
      setNotifications((prev) => prev.filter((n) => n.id !== id));
    }, 5000);
  };

  const removeNotification = (id: number) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  };

  // No longer needed as we use MetaMask connection from header
  // const generateNewEVMWallet = () => { ... }

  const connectMidnightWalletHandler = async () => {
    if (isConnectingMidnight) return;

    setIsConnectingMidnight(true);

    try {
      console.log("🌙 [NETWORK] Connecting to Midnight wallet...");
      showNotification(
        "info",
        "Connecting to Midnight",
        "Building wallet and connecting to contract...",
      );

      // Connect to Midnight wallet
      const { wallet, providers } = await connectMidnightWallet();

      // Get wallet address - it should already be available from the connection process
      let walletAddress = "Unknown";
      try {
        // Try to get the current state with a timeout
        const state = await wallet.state().pipe(
          take(1),
          timeout(5000), // 5 second timeout
        ).toPromise();
        walletAddress = state?.address || "Unknown";
      } catch (error) {
        console.warn(
          "Could not get wallet address immediately, using fallback",
        );
        // Fallback: try to get address from wallet properties if available
        walletAddress = (wallet as any).address || "Unknown";
      }

      console.log("🔗 [NETWORK] Joining contract...");
      showNotification(
        "info",
        "Joining Contract",
        "Connecting to the counter contract...",
      );

      // Join contract and get initial state
      const { counterContract, currentState } = await connectToContract(
        providers,
      );

      const newMidnightWallet: MidnightWallet = {
        address: walletAddress,
        connected: true,
        contractConnected: true,
        currentCounterValue: currentState.counterValue,
        contractAddress: currentState.contractAddress,
      };

      setMidnightWallet(newMidnightWallet);

      showNotification(
        "success",
        "Midnight Wallet Connected",
        `Connected to wallet and contract. Current counter: ${
          currentState.counterValue ?? "N/A"
        }`,
      );
    } catch (error) {
      console.error("Failed to connect Midnight wallet:", error);
      showNotification(
        "error",
        "Connection Failed",
        error instanceof Error
          ? error.message
          : "Failed to connect to Midnight wallet",
      );
    } finally {
      setIsConnectingMidnight(false);
    }
  };

  const createERC721Token = async () => {
    if (!walletConnected || !walletAddress || !hardhatWalletClient) {
      showNotification(
        "error",
        "No Wallet Connected",
        "Please connect your MetaMask wallet first",
      );
      return;
    }

    setIsCreatingToken(true);

    try {
      if (!erc721Address) {
        throw new Error(
          "ERC721 contract address not found. Make sure contracts are deployed.",
        );
      }

      // Validate and use the user-provided token ID
      const tokenIdStr = createTokenId.trim();
      if (!tokenIdStr) {
        throw new Error("Token ID cannot be empty");
      }

      // Check if it's a valid number
      if (!/^\d+$/.test(tokenIdStr)) {
        throw new Error("Token ID must be a positive number");
      }

      const tokenId = BigInt(tokenIdStr);

      console.log("🎨 [CONTRACT] Minting ERC721 token:", {
        contract: erc721Address,
        tokenId: tokenId.toString(),
        to: walletAddress,
      });

      showNotification(
        "info",
        "Minting NFT",
        "Calling mint function on ERC721 contract via Hardhat...",
      );

      // Call the mint function on the ERC721 contract using hardhat wallet client
      const mintTxHash = await writeContract(hardhatWalletClient, {
        address: erc721Address,
        abi: erc721dev.abi,
        functionName: "mint",
        args: [walletAddress as `0x${string}`, tokenId],
        account: walletAddress as `0x${string}`,
        chain: hardhat,
      });

      console.log("✅ [CONTRACT] ERC721 mint transaction hash:", mintTxHash);

      const publicClient = createPublicClient({
        chain: hardhat,
        transport: http(),
      });

      const transaction = await publicClient.waitForTransactionReceipt({
        hash: mintTxHash,
      });
      console.log("🎉 [CONTRACT] Transaction receipt:", transaction);

      showNotification(
        "success",
        "NFT Minted on Hardhat",
        `Token minted successfully on Hardhat chain! Tx: ${
          mintTxHash.slice(0, 10)
        }... Waiting for API to reflect the new token...`,
      );

      // Poll the API until the new token appears
      const pollForNewToken = async (attempts = 0, maxAttempts = 30) => {
        try {
          const apiData = await fetchNFTData();
          const tokenExists = apiData.some((token) =>
            token.token_id === tokenIdStr
          );

          if (tokenExists) {
            // Token found in API, update tokens and stop loading
            const convertedTokens = convertApiDataToTokens(apiData);
            setTokens(convertedTokens);
            showNotification(
              "success",
              "Token Available",
              `Token #${tokenIdStr} is now available in the API!`,
            );
            setIsCreatingToken(false);
          } else if (attempts < maxAttempts) {
            // Token not found yet, try again in 1 second
            setTimeout(() => {
              pollForNewToken(attempts + 1, maxAttempts);
            }, 1000);
          } else {
            // Max attempts reached, show warning but still stop loading
            showNotification(
              "warning",
              "Token Created But Not Yet Visible",
              `Token was minted but may take longer to appear in the API. Try refreshing manually.`,
            );
            loadTokens(); // Final attempt to load tokens
            setIsCreatingToken(false);
          }
        } catch (error) {
          console.error("Error polling for new token:", error);
          if (attempts < maxAttempts) {
            // If there's an error, try again
            setTimeout(() => {
              pollForNewToken(attempts + 1, maxAttempts);
            }, 1000);
          } else {
            // Max attempts reached, stop loading
            showNotification(
              "error",
              "Failed to Verify Token Creation",
              "Token may have been created but couldn't verify through API.",
            );
            setIsCreatingToken(false);
          }
        }
      };

      // Start polling for the new token
      pollForNewToken();
    } catch (error) {
      console.error("Failed to create token:", error);
      showNotification(
        "error",
        "Token Creation Failed",
        error instanceof Error ? error.message : "Failed to create token",
      );
      setIsCreatingToken(false);
    }
  };

  const incrementCounter = async () => {
    if (!midnightWallet?.contractConnected) {
      showNotification(
        "error",
        "Contract Not Connected",
        "Connect to Midnight wallet and contract first",
      );
      return;
    }

    // if (!selectedToken) {
    //   showNotification(
    //     "error",
    //     "No NFT Selected",
    //     "Please select an NFT to add the property to",
    //   );
    //   return;
    // }

    // Check if token exists and is valid
    const selectedTokenData = tokens.find((token) =>
      token.id === selectedToken
    );
    // if (!selectedTokenData) {
    //   showNotification(
    //     "error",
    //     "Token Not Found",
    //     "The selected ERC721 token does not exist",
    //   );
    //   return;
    // }

    // if (!selectedTokenData.isValid) {
    //   showNotification(
    //     "error",
    //     "Invalid Token",
    //     "The selected token is invalid (no owner found)",
    //   );
    //   // return;
    // }

    if (!incrementForm.propertyName || !incrementForm.propertyValue) {
      showNotification(
        "error",
        "Missing Property Details",
        "Please fill in both property name and value",
      );
      return;
    }

    setIsIncrementingCounter(true);

    // Add animation for the property
    const propertyKey = `${selectedToken}-${incrementForm.propertyName}`;
    setAnimatingProperties((prev) => new Set([...prev, propertyKey]));
    setTimeout(() => {
      setAnimatingProperties((prev) => {
        const newSet = new Set(prev);
        newSet.delete(propertyKey);
        return newSet;
      });
    }, 1000);

    try {
      console.log("🏷️ [NETWORK] Adding property to NFT via Midnight network");
      console.log("📝 [PROPERTY] Contract:", incrementForm.contractAddress);
      console.log("📝 [PROPERTY] Token ID:", incrementForm.tokenId);
      console.log(
        "📝 [PROPERTY] Property:",
        incrementForm.propertyName,
        "=",
        incrementForm.propertyValue,
      );

      // Show processing notification
      showNotification(
        "info",
        "Adding Property",
        `Adding "${incrementForm.propertyName}" property to NFT on Midnight network...`,
      );

      // Call the increment function with the form parameters
      const result = await incrementCounterValue(
        incrementForm.contractAddress,
        incrementForm.tokenId,
        incrementForm.propertyName,
        incrementForm.propertyValue,
      );

      // Fetch updated state
      const updatedState = await fetchCurrentCounterState();

      // Update the wallet state with new counter value
      setMidnightWallet((prev) =>
        prev
          ? {
            ...prev,
            currentCounterValue: updatedState.counterValue,
          }
          : null
      );

      showNotification(
        "success",
        "Property Added",
        `Property "${incrementForm.propertyName}: ${incrementForm.propertyValue}" added to NFT successfully! Transaction: ${result.txId}. Data will refresh from API.`,
      );

      // Refresh tokens after a delay to get updated data
      setTimeout(() => {
        loadTokens();
      }, 2000);
    } catch (error) {
      console.error("Failed to add property:", error);
      showNotification(
        "error",
        "Property Addition Failed",
        `Failed to add property "${incrementForm.propertyName}: ${incrementForm.propertyValue}" to NFT: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
      );
    } finally {
      setIsIncrementingCounter(false);
    }
  };

  return (
    <div className="wallet-demo-section">
      {/* Notifications */}
      <div className="wallet-demo-notifications">
        {notifications.map((notification) => (
          <div
            key={notification.id}
            className={`wallet-demo-notification ${notification.type}`}
          >
            <div>
              <div className="notification-title">{notification.title}</div>
              <div className="notification-message">{notification.message}</div>
            </div>
            <button
              type="button"
              onClick={() => removeNotification(notification.id)}
              className="notification-close"
            >
              ×
            </button>
          </div>
        ))}
      </div>

      <div
        onClick={() => setIsCollapsed(!isCollapsed)}
        className="wallet-demo-header"
      >
        <h2 className="wallet-demo-title">
          Multi-Chain Wallet Demo: EVM ↔ Midnight Integration
        </h2>
        <span className={`collapse-arrow ${isCollapsed ? "collapsed" : ""}`}>
          ▼
        </span>
      </div>

      {!isCollapsed && (
        <div className="wallet-demo-content">
          <div className="wallet-demo-intro">
            <p>
              Demonstrating EVM wallet connection for token creation and
              Midnight wallet connection for counter increment operations across
              different blockchains.
            </p>
          </div>

          <div className="wallets-container">
            {/* EVM Wallet Section */}
            <div className="evm-wallet-section">
              <h3 className="wallet-section-title evm-title">EVM Blockchain</h3>

              <div className="wallet-info">
                <div className="current-wallet">
                  <span className="wallet-label">Current Wallet:</span>
                  <span className="wallet-address evm-address">
                    {walletConnected && walletAddress
                      ? `${walletAddress.slice(0, 8)}...${
                        walletAddress.slice(-6)
                      }`
                      : "No wallet connected"}
                  </span>
                </div>

                <div className="wallet-status">
                  {walletConnected
                    ? "✅ MetaMask Connected"
                    : "❌ Connect MetaMask using the header button"}
                </div>

                {
                  /* {walletConnected && (
                  <div
                    className="hardhat-status"
                    style={{ marginTop: "8px", fontSize: "12px" }}
                  >
                    {hardhatWalletClient
                      ? "🔗 Hardhat Chain Connected"
                      : "⏳ Connecting to Hardhat Chain..."}
                  </div>
                )} */
                }
              </div>

              {walletConnected && (
                <div className="token-creation">
                  <div className="token-input-group">
                    <div className="token-id-creation-group">
                      <label htmlFor="createTokenId" className="token-id-label">
                        Token ID:
                      </label>
                      <div className="token-id-input-wrapper">
                        <input
                          id="createTokenId"
                          type="text"
                          value={createTokenId}
                          onChange={(e) => setCreateTokenId(e.target.value)}
                          className={`token-name-input evm-input ${
                            createTokenId.trim() &&
                              !/^\d+$/.test(createTokenId.trim())
                              ? "form-input-error"
                              : ""
                          }`}
                          placeholder="Enter token ID"
                        />
                        <button
                          type="button"
                          onClick={() =>
                            setCreateTokenId(Date.now().toString())}
                          className="refresh-timestamp-btn"
                          title="Refresh with current timestamp"
                        >
                          🕐
                        </button>
                      </div>
                      {createTokenId.trim() &&
                        !/^\d+$/.test(createTokenId.trim()) && (
                        <div className="input-warning">
                          ⚠️ Token ID must be a positive number
                        </div>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={createERC721Token}
                      className="wallet-button evm-button"
                      disabled={isCreatingToken || !walletConnected ||
                        !hardhatWalletClient || !createTokenId.trim() ||
                        !/^\d+$/.test(createTokenId.trim())}
                    >
                      {isCreatingToken
                        ? (
                          <>
                            <span className="loader"></span>
                            Creating Token...
                          </>
                        )
                        : (
                          "MINT ERC721 Token"
                        )}
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Midnight Wallet Section */}
            <div className="midnight-wallet-section">
              <h3 className="wallet-section-title midnight-title">
                Midnight Blockchain
              </h3>

              <div className="wallet-info">
                <div className="current-wallet">
                  <span className="wallet-label">Current Wallet:</span>
                  <span className="wallet-address midnight-address">
                    {midnightWallet?.connected
                      ? `${midnightWallet.address.slice(0, 12)}...${
                        midnightWallet.address.slice(-8)
                      }`
                      : "No wallet connected"}
                  </span>
                </div>

                {midnightWallet?.connected && (
                  <div className="contract-status">
                    <div className="contract-info">
                      <span className="contract-label">Contract:</span>
                      <span className="contract-address">
                        {midnightWallet.contractConnected
                          ? `${midnightWallet.contractAddress?.slice(0, 8)}...${
                            midnightWallet.contractAddress?.slice(-6)
                          }`
                          : "Not connected"}
                      </span>
                    </div>
                    <div className="counter-value">
                      <span className="counter-label">Counter Value:</span>
                      <span className="counter-number">
                        {midnightWallet.currentCounterValue?.toString() ??
                          "N/A"}
                      </span>
                    </div>
                  </div>
                )}

                <button
                  type="button"
                  onClick={connectMidnightWalletHandler}
                  className="wallet-button midnight-button"
                  disabled={isConnectingMidnight}
                >
                  {isConnectingMidnight
                    ? (
                      <>
                        <span className="loader"></span>
                        Connecting...
                      </>
                    )
                    : midnightWallet?.connected
                    ? "✅ Midnight Wallet Connected"
                    : "Connect Midnight Wallet"}
                </button>
              </div>

              {midnightWallet?.contractConnected && (
                <div className="counter-operations">
                  <h4 className="counter-title">Add NFT Property</h4>

                  <div className="increment-form">
                    <div className="form-table">
                      <div className="form-row">
                        <label htmlFor="contractAddress" className="form-label">
                          Contract Address:
                        </label>
                        <input
                          id="contractAddress"
                          type="text"
                          value={incrementForm.contractAddress}
                          onChange={(e) =>
                            setIncrementForm((prev) => ({
                              ...prev,
                              contractAddress: e.target.value,
                            }))}
                          className="form-input"
                          placeholder="0x..."
                          disabled
                        />
                      </div>

                      <div className="form-row">
                        <label htmlFor="tokenId" className="form-label">
                          Token ID:
                        </label>
                        <div className="token-id-input-group">
                          <input
                            id="tokenId"
                            type="text"
                            value={tokenIdInput}
                            onChange={(e) => {
                              setTokenIdInput(e.target.value);
                              setIncrementForm((prev) => ({
                                ...prev,
                                tokenId: e.target.value,
                              }));
                            }}
                            className={`form-input ${
                              tokenIdInput && !tokens.find((t) =>
                                  t.id === tokenIdInput
                                )
                                ? "form-input-error"
                                : ""
                            }`}
                            placeholder="Enter or select token ID"
                          />
                          {tokenIdInput && !tokens.find((t) =>
                            t.id === tokenIdInput
                          ) && (
                            <div className="input-warning">
                              ⚠️ The ERC721 token does not exist
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="form-row">
                        <label htmlFor="propertyName" className="form-label">
                          Property Name:
                        </label>
                        <input
                          id="propertyName"
                          type="text"
                          value={incrementForm.propertyName}
                          onChange={(e) =>
                            setIncrementForm((prev) => ({
                              ...prev,
                              propertyName: e.target.value,
                            }))}
                          className="form-input"
                          placeholder="e.g., Level, Strength, Rarity"
                        />
                      </div>

                      <div className="form-row">
                        <label htmlFor="propertyValue" className="form-label">
                          Property Value:
                        </label>
                        <div className="property-value-input-group">
                          <input
                            id="propertyValue"
                            type="text"
                            value={incrementForm.propertyValue}
                            onChange={(e) =>
                              setIncrementForm((prev) => ({
                                ...prev,
                                propertyValue: e.target.value,
                              }))}
                            className="form-input"
                            placeholder="e.g., 1, Legendary, 100"
                          />
                          {incrementForm.propertyName.toLowerCase() ===
                              "name" && (
                            <button
                              type="button"
                              onClick={() => {
                                const randomName = RANDOM_TOKEN_NAMES[
                                  Math.floor(
                                    Math.random() * RANDOM_TOKEN_NAMES.length,
                                  )
                                ];
                                setIncrementForm((prev) => ({
                                  ...prev,
                                  propertyValue: randomName,
                                }));
                              }}
                              className="wallet-button midnight-button random-name-btn"
                              title="Generate random name"
                            >
                              🎲
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="counter-actions">
                    <button
                      type="button"
                      onClick={incrementCounter}
                      className="wallet-button midnight-button increment-button"
                      disabled={isIncrementingCounter ||
                        !incrementForm.propertyName ||
                        !incrementForm.propertyValue}
                    >
                      {isIncrementingCounter
                        ? (
                          <>
                            <span className="loader"></span>
                            Adding Property...
                          </>
                        )
                        : (
                          "🏷️ Add Property to NFT"
                        )}
                    </button>
                  </div>

                  <div className="counter-description">
                    <p>
                      Select an NFT below and fill in the property details
                      above. Click the button to add the property to your
                      selected NFT via the Midnight blockchain.
                    </p>
                    {!selectedToken && (
                      <p
                        style={{
                          color: "#f59e0b",
                          fontSize: "14px",
                          marginTop: "8px",
                        }}
                      >
                        ⚠️ Please select an NFT from the cards below first.
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Tokens Cards Grid */}
          <div className="tokens-cards-container">
            <div className="cards-header">
              <h3 className="cards-title">
                ERC721 Tokens & Properties
                {isLoadingTokens && (
                  <span className="loading-indicator">(Loading...)</span>
                )}
              </h3>
              <button
                type="button"
                onClick={loadTokens}
                className="refresh-button"
                disabled={isLoadingTokens}
                title="Refresh token list"
              >
                {isLoadingTokens ? <span className="loader-small"></span> : (
                  "🔄"
                )}
              </button>
            </div>

            {tokens.length === 0 && !isLoadingTokens && (
              <div className="no-tokens-message">
                <p>No tokens found. Create an ERC721 token to get started!</p>
              </div>
            )}

            {tokens.length > 0 && (
              <div className="tokens-cards-grid">
                {tokens
                  .sort((a, b) => parseInt(b.id) - parseInt(a.id)) // Sort by token ID descending
                  .map((token) => (
                    <div
                      key={token.id}
                      className={`token-card ${
                        selectedToken === token.id ? "selected-card" : ""
                      } ${
                        animatingTokens.has(token.id)
                          ? "new-token-animation"
                          : ""
                      } ${!token.isValid ? "invalid-token" : ""}`}
                      onClick={() => handleCardSelect(token.id)}
                    >
                      <div className="card-header">
                        <div className="card-selection-indicator">
                          {selectedToken === token.id && (
                            <span className="selected-icon">✓</span>
                          )}
                        </div>
                        <h4 className="card-token-name">
                          {token.properties.Name || `Token #${token.id}`}
                          {!token.isValid && (
                            <span className="invalid-badge">Invalid Token</span>
                          )}
                        </h4>
                      </div>

                      <div className="card-body">
                        <div className="card-owner">
                          <span className="owner-label">Owner:</span>
                          <span className="owner-address">
                            {token.owner
                              ? `${token.owner.slice(0, 8)}...${
                                token.owner.slice(-6)
                              }`
                              : "No owner"}
                          </span>
                        </div>

                        {!token.isValid && (
                          <div className="card-warning">
                            <span className="warning-text">
                              ⚠️ Invalid token - no owner found
                            </span>
                          </div>
                        )}

                        <div className="card-properties">
                          <div className="properties-header">Properties:</div>
                          {Object.entries(token.properties).length === 0
                            ? (
                              <div className="no-properties-card">
                                <div className="no-properties-text">
                                  No properties yet - try these suggestions:
                                </div>
                                <div className="card-property-suggestions">
                                  {(tokenSuggestions[token.id] || [])
                                    .map((
                                      suggestion: PropertySuggestion,
                                    ) => (
                                      <button
                                        key={`${token.id}-${suggestion.key}`}
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation(); // Prevent card selection
                                          handleCardSelect(token.id); // Select the card first
                                          // Note: Property suggestions disabled for counter demo
                                        }}
                                        className="card-suggestion-tag"
                                        title={suggestion.description}
                                        disabled
                                      >
                                        {suggestion.key}
                                      </button>
                                    ))}
                                </div>
                              </div>
                            )
                            : (
                              <div className="properties-grid-card">
                                {Object.entries(token.properties).map((
                                  [key, value],
                                ) => (
                                  <div
                                    key={key}
                                    className={`property-card-tag ${
                                      animatingProperties.has(
                                          `${token.id}-${key}`,
                                        )
                                        ? "new-property-animation"
                                        : ""
                                    }`}
                                  >
                                    <span className="property-key">{key}:</span>
                                    <span className="property-value">
                                      {value}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            )}
                        </div>
                      </div>
                    </div>
                  ))}
              </div>
            )}
          </div>
        </div>
      )}

      <style>
        {`
          .wallet-demo-section {
            background: rgba(255, 255, 255, 0.95);
            backdrop-filter: blur(10px);
            border-radius: 15px;
            box-shadow: 0 8px 32px rgba(31, 38, 135, 0.37);
            border: 1px solid rgba(255, 255, 255, 0.18);
            margin-top: 30px;
            position: relative;
          }

          .wallet-demo-notifications {
            position: fixed;
            top: 10px;
            right: 20px;
            z-index: 9999;
            display: flex;
            flex-direction: column;
            gap: 10px;
            pointer-events: none;
          }

          .wallet-demo-notification {
            padding: 12px 16px;
            border-radius: 8px;
            min-width: 300px;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            animation: slideInRight 0.3s ease-out;
            color: white;
            pointer-events: auto;
          }

          .wallet-demo-notification.success {
            background: #10b981;
          }

          .wallet-demo-notification.error {
            background: #ef4444;
          }

          .wallet-demo-notification.info {
            background: #3b82f6;
          }

          .wallet-demo-notification.warning {
            background: #f59e0b;
          }

          .notification-title {
            font-weight: 600;
            margin-bottom: 4px;
          }

          .notification-message {
            font-size: 14px;
            opacity: 0.9;
          }

          .notification-close {
            background: none;
            border: none;
            color: white;
            cursor: pointer;
            font-size: 18px;
            padding: 0;
            margin-left: 12px;
            opacity: 0.7;
          }

          /* Loader styles */
          .loader {
            width: 16px;
            height: 16px;
            border: 2px solid rgba(255, 255, 255, 0.3);
            border-top: 2px solid white;
            border-radius: 50%;
            animation: spin 1s linear infinite;
            display: inline-block;
            margin-right: 8px;
          }

          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }

          .wallet-demo-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            cursor: pointer;
            padding: 25px 30px;
            border-bottom: 1px solid rgba(0, 0, 0, 0.1);
          }

          .wallet-demo-title {
            font-size: 1.8rem;
            font-weight: 700;
            background: linear-gradient(45deg, #1e3a8a, #0a1a2e);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            background-clip: text;
            margin: 0;
          }

          .collapse-arrow {
            font-size: 18px;
            color: #666;
            transition: transform 0.2s ease-in-out;
          }

          .collapse-arrow.collapsed {
            transform: rotate(-90deg);
          }

          .wallet-demo-content {
            padding: 30px;
          }

          .wallet-demo-intro {
            text-align: center;
            margin-bottom: 30px;
            padding: 20px;
            background: rgba(30, 58, 138, 0.1);
            border-radius: 10px;
            color: #555;
            font-style: italic;
          }

          .wallets-container {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 30px;
            margin-bottom: 30px;
          }

          .evm-wallet-section {
            background: linear-gradient(135deg, #f8fafc, #f1f5f9);
            border: 2px solid #6b7280;
            border-radius: 15px;
            padding: 25px;
            color: #0f172a;
          }

          .midnight-wallet-section {
            background: linear-gradient(135deg, #0f172a, #1e293b);
            border: 2px solid #64748b;
            border-radius: 15px;
            padding: 25px;
            color: #f0f9ff;
          }

          .wallet-section-title {
            font-size: 1.4rem;
            font-weight: 600;
            margin-bottom: 20px;
            text-align: center;
            padding: 12px;
            border-radius: 8px;
            /* Reset any inherited text effects */
            -webkit-background-clip: initial;
            background-clip: initial;
            -webkit-text-fill-color: initial;
            text-shadow: none;
            border-bottom: none;
          }

          .wallet-section-title.evm-title {
            background: linear-gradient(135deg, #f8fafc, #e2e8f0);
            color: #0f172a;
            border: 2px solid #6b7280;
            font-weight: 700;
          }

          .wallet-section-title.midnight-title {
            background: linear-gradient(135deg, #0f172a, #1e293b);
            color: #f0f9ff;
            border: 2px solid #64748b;
            font-weight: 700;
          }

          .wallet-info {
            // margin-bottom: 20px;
          }

          .wallet-status {
            text-align: center;
            padding: 10px;
            border-radius: 6px;
            font-size: 0.9rem;
            font-weight: 500;
            margin-top: 10px;
          }

          .evm-wallet-section .wallet-status {
            background: rgba(16, 185, 129, 0.1);
            color: #059669;
            border: 1px solid rgba(16, 185, 129, 0.3);
          }

          .current-wallet {
            display: flex;
            justify-content: space-between;
            align-items: center;
            // margin-bottom: 15px;
            padding: 15px;
            border-radius: 8px;
          }

          .evm-wallet-section .current-wallet {
            background: rgba(255, 255, 255, 0.8);
            border: 1px solid #6b7280;
          }

          .midnight-wallet-section .current-wallet {
            background: rgba(15, 23, 42, 0.8);
            border: 1px solid #64748b;
          }

          .wallet-label {
            font-weight: 600;
          }

          .evm-wallet-section .wallet-label {
            color: #0f172a;
          }

          .midnight-wallet-section .wallet-label {
            color: #f0f9ff;
          }

          .wallet-address {
            font-family: monospace;
            font-size: 0.9rem;
            padding: 5px 10px;
            border-radius: 4px;
          }

          .evm-address {
            background: #f3f4f6;
            color: #374151;
            border: 1px solid #6b7280;
            font-weight: 600;
          }

          .midnight-address {
            background: #1e293b;
            color: #e2e8f0;
            border: 1px solid #64748b;
            font-weight: 600;
          }

          .wallet-button {
            padding: 12px 20px;
            border: none;
            border-radius: 8px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.3s ease;
            display: flex;
            align-items: center;
            justify-content: center;
            min-height: 44px;
          }

          .evm-button {
            background: linear-gradient(45deg, #3b82f6, #2563eb);
            color: white;
          }

          .evm-button:hover {
            background: linear-gradient(45deg, #2563eb, #1d4ed8);
            transform: translateY(-2px);
          }

          .evm-button:disabled {
            background: #ccc;
            cursor: not-allowed;
            transform: none;
          }

          .midnight-button {
            background: linear-gradient(45deg, #3b82f6, #2563eb);
            color: white;
          }

          .midnight-button:hover {
            background: linear-gradient(45deg, #2563eb, #1d4ed8);
            transform: translateY(-2px);
          }

          .midnight-button:disabled {
            background: #9ca3af;
            cursor: not-allowed;
            transform: none;
          }

          .token-creation, .counter-operations {
            margin-top: 20px;
          }

          .token-input-group, .property-input-group {
            display: flex;
            gap: 15px;
            align-items: center;
            flex-wrap: wrap;
            flex-direction: column;
          }

          .token-id-creation-group {
            display: flex;
            flex-direction: column;
            gap: 8px;
            width: 100%;
          }

          .token-id-label {
            font-weight: 600;
            color: #0f172a;
            font-size: 0.9rem;
          }

          .token-id-input-wrapper {
            display: flex;
            gap: 8px;
            align-items: center;
          }

          .token-id-input-wrapper .token-name-input {
            flex: 1;
          }

          .refresh-timestamp-btn {
            background: linear-gradient(45deg, #10b981, #059669);
            color: white;
            border: none;
            border-radius: 6px;
            padding: 10px 12px;
            cursor: pointer;
            transition: all 0.3s ease;
            font-size: 1.1rem;
            display: flex;
            align-items: center;
            justify-content: center;
            min-width: 44px;
            min-height: 44px;
            box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
          }

          .refresh-timestamp-btn:hover {
            background: linear-gradient(45deg, #059669, #047857);
            transform: translateY(-1px);
            box-shadow: 0 4px 8px rgba(0, 0, 0, 0.15);
          }

          .token-name-input, .property-input {
            padding: 10px;
            border-radius: 6px;
            border: 2px solid;
            font-size: 0.9rem;
          }

          .evm-input {
            border-color: #6b7280;
            background: #ffffff;
            color: #0f172a;
          }

          .evm-input:focus {
            outline: none;
            border-color: #3b82f6;
            box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
          }

          .midnight-input {
            border-color: #64748b;
            background: #1e293b;
            color: #f0f9ff;
          }

          .midnight-input:focus {
            outline: none;
            border-color: #94a3b8;
            box-shadow: 0 0 0 3px rgba(100, 116, 139, 0.1);
          }

          .counter-title {
            color: #f0f9ff;
            margin-bottom: 15px;
            font-size: 1.1rem;
            font-weight: 600;
          }

          .contract-status {
            margin: 15px 0;
            padding: 15px;
            background: rgba(15, 23, 42, 0.8);
            border: 1px solid #64748b;
            border-radius: 8px;
          }

          .contract-info,
          .counter-value {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 10px;
            font-size: 0.9rem;
          }

          .counter-value:last-child {
            margin-bottom: 0;
          }

          .contract-label,
          .counter-label {
            font-weight: 600;
            color: #f0f9ff;
          }

          .contract-address {
            font-family: monospace;
            background: #1e293b;
            color: #e2e8f0;
            border: 1px solid #64748b;
            font-weight: 600;
            padding: 4px 8px;
            border-radius: 4px;
            font-size: 0.8rem;
          }

          .counter-number {
            font-family: monospace;
            background: rgba(16, 185, 129, 0.2);
            color: #10b981;
            border: 1px solid rgba(16, 185, 129, 0.3);
            font-weight: 700;
            padding: 6px 12px;
            border-radius: 6px;
            font-size: 1.1rem;
          }

          .counter-operations {
            margin-top: 20px;
          }

          .increment-form {
            margin-bottom: 20px;
          }

          .form-table {
            display: flex;
            flex-direction: column;
            gap: 15px;
            background: rgba(15, 23, 42, 0.6);
            padding: 20px;
            border-radius: 10px;
            border: 1px solid #64748b;
          }

          .form-row {
            display: flex;
            align-items: center;
            gap: 15px;
          }

          .form-label {
            color: #f0f9ff;
            font-weight: 600;
            font-size: 0.9rem;
            min-width: 140px;
            text-align: right;
            flex-shrink: 0;
          }

          .form-input {
            flex: 1;
            padding: 10px 12px;
            border: 2px solid #64748b;
            border-radius: 6px;
            background: #1e293b;
            color: #f0f9ff;
            font-size: 0.9rem;
            transition: all 0.3s ease;
          }

          .form-input:focus {
            outline: none;
            border-color: #94a3b8;
            box-shadow: 0 0 0 3px rgba(100, 116, 139, 0.1);
          }

          .form-input:disabled {
            background: #334155;
            color: #94a3b8;
            cursor: not-allowed;
          }

          .counter-actions {
            display: flex;
            justify-content: center;
            margin-bottom: 15px;
          }

          .increment-button {
            font-size: 1rem;
            padding: 15px 25px;
            font-weight: 700;
          }

          .counter-description {
            text-align: center;
            color: #94a3b8;
            font-size: 0.9rem;
            line-height: 1.4;
          }

          .property-suggestions {
            margin-bottom: 20px;
          }

          .suggestions-label {
            color: #f0f9ff;
            font-size: 0.9rem;
            margin-bottom: 10px;
            font-weight: 500;
          }

          .suggestions-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
            gap: 8px;
            margin-bottom: 15px;
          }

          .suggestion-button {
            background: rgba(100, 116, 139, 0.2);
            border: 1px solid #64748b;
            color: #f0f9ff;
            padding: 8px 12px;
            border-radius: 6px;
            font-size: 0.8rem;
            cursor: pointer;
            transition: all 0.2s ease;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
          }

          .suggestion-button:hover {
            background: rgba(100, 116, 139, 0.4);
            border-color: #94a3b8;
            transform: translateY(-1px);
          }

          /* Replace table styles with card styles */
          .tokens-cards-container {
            background: rgba(255, 255, 255, 0.9);
            border-radius: 12px;
            padding: 25px;
            box-shadow: 0 4px 20px rgba(31, 38, 135, 0.2);
            border: 1px solid rgba(30, 58, 138, 0.2);
          }

          .cards-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            margin-bottom: 20px;
            padding: 15px;
            background: rgba(30, 58, 138, 0.1);
            border-radius: 8px;
          }

          .cards-title {
            font-size: 1.4rem;
            font-weight: 600;
            color: #1e3a8a;
            margin: 0;
            flex: 1;
            text-align: center;
          }

          .refresh-button {
            background: linear-gradient(45deg, #3b82f6, #2563eb);
            color: white;
            border: none;
            border-radius: 8px;
            padding: 10px 12px;
            cursor: pointer;
            transition: all 0.3s ease;
            font-size: 1.2rem;
            display: flex;
            align-items: center;
            justify-content: center;
            min-width: 44px;
            min-height: 44px;
            box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
          }

          .refresh-button:hover:not(:disabled) {
            background: linear-gradient(45deg, #2563eb, #1d4ed8);
            transform: translateY(-2px);
            box-shadow: 0 4px 8px rgba(0, 0, 0, 0.2);
          }

          .refresh-button:disabled {
            background: #9ca3af;
            cursor: not-allowed;
            transform: none;
            box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
          }

          .loader-small {
            width: 14px;
            height: 14px;
            border: 2px solid rgba(255, 255, 255, 0.3);
            border-top: 2px solid white;
            border-radius: 50%;
            animation: spin 1s linear infinite;
          }

          .tokens-cards-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
            gap: 20px;
            margin-top: 20px;
          }

          .token-card {
            background: white;
            border: 2px solid rgba(30, 58, 138, 0.2);
            border-radius: 12px;
            padding: 20px;
            cursor: pointer;
            transition: all 0.3s ease;
            box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
            position: relative;
            min-height: 240px;
          }

          .token-card:hover {
            transform: translateY(-3px);
            box-shadow: 0 6px 20px rgba(30, 58, 138, 0.3);
            border-color: rgba(30, 58, 138, 0.4);
          }

          .token-card.selected-card {
            border-color: #3b82f6;
            background: rgba(59, 130, 246, 0.05);
            box-shadow: 0 4px 15px rgba(59, 130, 246, 0.3);
          }

          .card-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            margin-bottom: 15px;
            padding-bottom: 10px;
            border-bottom: 2px solid rgba(30, 58, 138, 0.1);
          }

          .card-selection-indicator {
            width: 24px;
            height: 24px;
            border: 2px solid #ccc;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: all 0.2s ease;
          }

          .selected-card .card-selection-indicator {
            border-color: #3b82f6;
            background: #3b82f6;
          }

          .selected-icon {
            color: white;
            font-size: 0.8rem;
            font-weight: bold;
          }

          .card-token-name {
            font-size: 1.1rem;
            font-weight: 600;
            color: #1e3a8a;
            margin: 0;
            flex: 1;
            margin-left: 15px;
            text-align: center;
          }

          .card-body {
            display: flex;
            flex-direction: column;
            gap: 12px;
          }

          .card-owner,
          .card-created {
            display: flex;
            justify-content: space-between;
            align-items: center;
            font-size: 0.9rem;
          }

          .owner-label,
          .created-label {
            font-weight: 600;
            color: #555;
          }

          .owner-address {
            font-family: monospace;
            background: rgba(0, 0, 0, 0.05);
            padding: 4px 8px;
            border-radius: 4px;
            color: #666;
            font-size: 0.8rem;
          }

          .created-time {
            color: #888;
            font-size: 0.8rem;
          }

          .card-properties {
            margin-top: 10px;
            flex: 1;
          }

          .properties-header {
            font-weight: 600;
            color: #555;
            margin-bottom: 10px;
            font-size: 0.9rem;
          }

          .no-properties-card {
            text-align: center;
            padding: 15px;
            background: rgba(0, 0, 0, 0.02);
            border-radius: 6px;
            border: 1px dashed #ddd;
          }

          .no-properties-text {
            color: #999;
            font-style: italic;
            font-size: 0.85rem;
            line-height: 1.4;
            margin-bottom: 12px;
          }

          .card-property-suggestions {
            display: flex;
            gap: 8px;
            justify-content: center;
            flex-wrap: wrap;
          }

          .card-suggestion-tag {
            background: rgba(59, 130, 246, 0.1);
            border: 1px solid rgba(59, 130, 246, 0.3);
            border-radius: 20px;
            padding: 6px 12px;
            cursor: pointer;
            transition: all 0.2s ease;
            font-size: 0.85rem;
            font-weight: 500;
            color: #3b82f6;
            white-space: nowrap;
            margin: 2px;
          }

          .card-suggestion-tag:hover {
            background: rgba(59, 130, 246, 0.2);
            border-color: rgba(59, 130, 246, 0.5);
            transform: translateY(-1px);
            box-shadow: 0 2px 8px rgba(59, 130, 246, 0.2);
            color: #2563eb;
          }

          .properties-grid-card {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
            gap: 8px;
          }

          .property-card-tag {
            background: rgba(30, 58, 138, 0.1);
            border: 1px solid rgba(30, 58, 138, 0.2);
            border-radius: 8px;
            padding: 8px 10px;
            display: flex;
            flex-direction: column;
            align-items: center;
            text-align: center;
            transition: all 0.2s ease;
            min-height: 50px;
            justify-content: center;
          }

          .property-card-tag:hover {
            background: rgba(30, 58, 138, 0.15);
            transform: scale(1.02);
          }

          .property-key {
            font-weight: 600;
            color: #1e3a8a;
            font-size: 0.8rem;
            margin-bottom: 2px;
          }

          .property-value {
            color: #555;
            font-size: 0.9rem;
            word-break: break-word;
          }

          /* Hide the old table styles when not needed */
          .tokens-table-container {
            display: none;
          }

          @keyframes slideInRight {
            from {
              transform: translateX(100%);
              opacity: 0;
            }
            to {
              transform: translateX(0);
              opacity: 1;
            }
          }

          @keyframes newTokenCreation {
            0% {
              transform: scale(0.8) translateY(-20px);
              opacity: 0;
              box-shadow: 0 0 0 0 rgba(59, 130, 246, 0.7);
            }
            50% {
              transform: scale(1.05) translateY(-5px);
              opacity: 1;
              box-shadow: 0 0 20px 10px rgba(59, 130, 246, 0.3);
            }
            100% {
              transform: scale(1) translateY(0);
              opacity: 1;
              box-shadow: 0 4px 15px rgba(59, 130, 246, 0.3);
            }
          }

          @keyframes newPropertyPulse {
            0% {
              transform: scale(1);
              background: rgba(16, 185, 129, 0.2);
              box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.7);
            }
            50% {
              transform: scale(1.1);
              background: rgba(16, 185, 129, 0.3);
              box-shadow: 0 0 15px 5px rgba(16, 185, 129, 0.4);
            }
            100% {
              transform: scale(1);
              background: rgba(30, 58, 138, 0.1);
              box-shadow: none;
            }
          }

          .new-token-animation {
            animation: newTokenCreation 1s ease-out;
          }

          .new-property-animation {
            animation: newPropertyPulse 0.8s ease-out;
          }

          .token-id-input-group,
          .property-value-input-group {
            display: flex;
            flex-direction: column;
            gap: 5px;
            flex: 1;
          }

          .property-value-input-group {
            flex-direction: row;
            align-items: center;
          }

          .property-value-input-group .form-input {
            flex: 1;
            margin-right: 10px;
          }

          .form-input-error {
            border-color: #ef4444 !important;
            box-shadow: 0 0 0 3px rgba(239, 68, 68, 0.1) !important;
          }

          .input-warning {
            color: #f59e0b;
            font-size: 0.8rem;
            font-weight: 500;
          }

          .loading-indicator {
            color: #3b82f6;
            font-size: 0.9rem;
            font-weight: 500;
          }

          .no-tokens-message {
            text-align: center;
            padding: 40px 20px;
            background: rgba(0, 0, 0, 0.02);
            border-radius: 10px;
            border: 2px dashed #ddd;
            color: #666;
            font-style: italic;
          }

          .invalid-token {
            border-color: #ef4444 !important;
            background: rgba(239, 68, 68, 0.05) !important;
          }

          .invalid-badge {
            background: #ef4444;
            color: white;
            font-size: 0.7rem;
            padding: 2px 6px;
            border-radius: 10px;
            margin-left: 8px;
            font-weight: 500;
          }

          .card-warning {
            background: rgba(245, 158, 11, 0.1);
            border: 1px solid rgba(245, 158, 11, 0.3);
            border-radius: 6px;
            padding: 8px;
            margin-bottom: 10px;
          }

          .warning-text {
            color: #f59e0b;
            font-size: 0.8rem;
            font-weight: 500;
          }

          @media (max-width: 768px) {
            .wallet-demo-notifications {
              top: 5px;
              right: 10px;
              left: 10px;
              width: auto;
            }

            .wallet-demo-notification {
              min-width: auto;
              width: 100%;
            }

            .wallets-container {
              grid-template-columns: 1fr;
            }
            
            .token-input-group, .property-input-group {
              flex-direction: column;
              align-items: stretch;
            }

            .token-id-input-wrapper {
              flex-direction: row;
              gap: 10px;
            }
            
            .wallet-demo-title {
              font-size: 1.4rem;
            }

            .tokens-cards-grid {
              grid-template-columns: 1fr;
              gap: 15px;
            }
            
            .token-card {
              min-height: 200px;
            }
            
            .properties-grid-card {
              grid-template-columns: 1fr 1fr;
            }
            
            .suggestions-grid {
              grid-template-columns: repeat(2, 1fr);
            }

            .card-property-suggestions {
              flex-direction: row;
              justify-content: center;
            }

            .card-suggestion-tag {
              font-size: 0.8rem;
              padding: 5px 10px;
            }

            .cards-header {
              flex-direction: column;
              gap: 15px;
              text-align: center;
            }

            .cards-title {
              margin-bottom: 0;
            }
          }

          @media (max-width: 640px) {
            .form-row {
              flex-direction: column;
              align-items: stretch;
              gap: 8px;
            }

            .form-label {
              text-align: left;
              min-width: auto;
            }
          }

          @media (max-width: 480px) {
            .properties-grid-card {
              grid-template-columns: 1fr;
            }

            .card-property-suggestions {
              gap: 4px;
            }

            .card-suggestion-tag {
              font-size: 0.75rem;
              padding: 4px 8px;
            }
          }
        `}
      </style>
    </div>
  );
}
