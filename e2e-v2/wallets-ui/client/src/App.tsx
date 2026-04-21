import React, { useEffect, useState } from "react";
import "./App.css";
import type { ConnectedAPI } from "@midnight-ntwrk/dapp-connector-api";

import {
  allInjectedWallets,
  PaimaEngineConfig,
  type Wallet,
  walletLogin,
  WalletMode,
  WalletNameMap,
  getAddressType,
} from "@effectstream/wallets";
import {
  sendBatcherTransaction,
  sendTransaction,
  signMessage,
} from "@effectstream/wallets";

import { createWalletClient, http } from "viem";
import { hardhat as hardhatChain } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";
import { BrowserProvider, JsonRpcSigner } from "ethers";
import { useMemo } from "react";
import { grammar } from "@e2e-v2/data-types";
import { config } from "@e2e-v2/data-types/config-localhost";
import { AddressValidator } from "@effectstream/utils";
import { AddressType } from "@effectstream/utils";
import { Value } from "@sinclair/typebox/value";
import { CryptoManager } from "@effectstream/crypto";
import type { Chain } from "viem";

import * as counter from "./contracts/counter.ts";

// LOCAL CONFIG
const network: Chain = hardhatChain;
network.name = "local hardhat";
network.rpcUrls = {
  default: {
    http: ["http://localhost:8545"],
  },
};
const contractAddressOnNetwork = "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512";
const batcherUrl = "http://localhost:3334";
const syncProtocolName = "parallelEvmRPC_fast";
// END LOCAL CONFIG

const paimaEngineConfig = new PaimaEngineConfig(
  undefined, // no app name
  syncProtocolName, // paima l2 sync protocol name
  contractAddressOnNetwork, // paima l2 contract address
  network, // paima l2 chain
  undefined, // use default paima l2 abi
  batcherUrl, // batcher url
);

const chainIdToWalletType = (chainId: WalletMode): string => {
  return WalletNameMap[chainId] || `Unknown (${chainId})`;
};

// Local Wallet
const viemAccount = privateKeyToAccount(
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
);
const viemClient = createWalletClient({
  account: viemAccount,
  chain: network,
  transport: http(),
});

interface PrimitiveInfo {
  name: string;
  syncProtocol: string;
  network: string;
  signature?: string;
  type: string;
  networkType: string;
}

// localhostConfig.primitives['evm-rpc-effectstream-l2'].primitive.abi = paimaL2Abi;
/** Convert Viem to Ether Signer */
/** Hook to convert a viem Wallet Client to an ethers.js Signer. */
function clientToSigner(client: any) { // Client<Transport, Chain, Account>) {
  const { account, chain, transport } = client;
  const network = {
    chainId: chain.id,
    name: chain.name,
    ensAddress: chain.contracts?.ensRegistry?.address,
  };
  const provider = new BrowserProvider(transport, network);
  const signer = new JsonRpcSigner(provider, account.address);
  return signer;
}

function logMidnightWalletAddresses(addresses: any): void {
  console.log("🔗 Midnight Wallet Connected Successfully!");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("📋 Wallet Addresses:");
  console.log(`  Shielded Address:       ${addresses.shieldedAddress}`);
  console.log(`  Unshielded Address:     ${addresses.unshieldedAddress}`);
  console.log(`  Dust Address:           ${addresses.dustAddress}`);
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
}

function App() {
  const [error, setError] = useState<string | null>(null);
  const [wallet, setWallet] = useState<(Wallet & { mode: WalletMode }) | null>(null);
  const [isAddressValid, setIsAddressValid] = useState<boolean | null>(null);
  const [selectedFunction, setSelectedFunction] = useState<string | null>(null);
  const [formValues, setFormValues] = useState<Record<string, any>>({});
  const [selectedPrimitive, setSelectedPrimitive] = useState<
    PrimitiveInfo | undefined
  >();
  const [actionResult, setActionResult] = useState<string | null>(null);
  const [signatureVerification, setSignatureVerification] = useState<boolean | null>(null);
  const [messageToVerify, setMessageToVerify] = useState<string | null>(null);
  const [signatureToVerify, setSignatureToVerify] = useState<string | null>(null);
  const [verificationArgs, setVerificationArgs] = useState<object | null>(null);
  const [editableUserAddress, setEditableUserAddress] = useState<string>('');
  const [editableMessage, setEditableMessage] = useState<string>('');
  const [editableSignature, setEditableSignature] = useState<string>('');
  const [selectedAction, setSelectedAction] = useState<string>("signMessage");
  const [injectedWallets, setInjectedWallets] = useState<
    Record<WalletMode, any> | null
  >(null);
  const [addressType, setAddressType] = useState<AddressType | null>(null);
  const [midnightProviders, setMidnightProviders] = useState<counter.CounterProviders | null>(null);
  const [midnightAddresses, setMidnightAddresses] = useState<any | null>(null);
  const [midnightContract, setMidnightContract] = useState<any | null>(null);
  const [messageToSign, setMessageToSign] = useState<string>("");
  const [messageToBatch, setMessageToBatch] = useState<string>(
    '["attack","1","1"]',
  );
  const [midnightCounterValue, setMidnightCounterValue] = useState<bigint | null>(null);

  useEffect(() => {
    if (wallet) {
      const addressType = getAddressType(wallet.mode);
      if (addressType !== null) {
        try {
          Value.Decode(AddressValidator[addressType], wallet.walletAddress);
          setIsAddressValid(true);
        } catch (e) {
          setIsAddressValid(false);
        }
      } else {
        setIsAddressValid(null);
      }
    } else {
      setIsAddressValid(null);
    }
  }, [wallet]);

  useEffect(() => {
    const fetchWallets = async () => {
      try {
        const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
        // Some wallets take a while to load, so we need to wait for them.
        await sleep(200);
        const wallets = await allInjectedWallets() as unknown as Record<
          WalletMode,
          any
        >;
        setInjectedWallets(wallets);
      } catch (e) {
        console.error("Failed to fetch injected wallets:", e);
      }
    };
    fetchWallets();
    setSelectedPrimitive({
      name: "Show All Wallets",
      syncProtocol: "",
      network: "",
      type: "",
      networkType: "all",
    });
  }, []);




  const handlePrimitiveChange = (primitive: PrimitiveInfo) => {
    setWallet(null);
    setSelectedFunction(null);
    setFormValues({});
    setActionResult(null);
    setSignatureVerification(null);
    setMessageToVerify(null);
    setSignatureToVerify(null);
    setVerificationArgs(null);
    setMessageToSign("");
    setSelectedPrimitive(primitive);
  };

  const primitives = useMemo<PrimitiveInfo[]>(() => {
    const basePrimitives = Object.entries(config.primitives).map(
      ([name, primitiveData]: [string, any]) => {
        const syncProtocol: any = primitiveData.syncProtocol;
        // @ts-ignore - TODO: fix types in config
        const network =
          (config.syncProtocols.parallel as any)[syncProtocol]
            ?.network || "";
        // @ts-ignore - TODO: fix types in config
        const networkType =
          (config.allNetworks.networks as any)[network]?.type ||
          "unknown";

        return {
          name,
          syncProtocol,
          network,
          signature: "",
          type: primitiveData.primitive.type,
          networkType,
        };
      },
    );

    return [
      {
        name: "Show All Wallets",
        syncProtocol: "",
        network: "",
        type: "",
        networkType: "all",
      },
      ...basePrimitives,
    ];
  }, []);

  const handleLogin = async (loginAction: () => Promise<any>, mode: WalletMode) => {
    setError(null);
    setWallet(null);
    setSelectedFunction(null);
    setFormValues({});
    setActionResult(null);
    setSignatureVerification(null);
    setMessageToVerify(null);
    setSignatureToVerify(null);
    setVerificationArgs(null);
    setEditableUserAddress('');
    setEditableMessage('');
    setEditableSignature('');
    try {
      const result = await loginAction();
      if (result.success) {
        setWallet({ ...result.result, mode });

        console.log("wallet set", result.result);
      } else {
        setError(result.errorMessage);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const submitToBatcher = async (serializedTx: string, circuitId: string, addr: string) => {
    console.log(`🚀 Sending ${circuitId} transaction to Batcher...`);
    
    const body = {
      data: {
        target: "midnight_balancing",
        address: addr,
        addressType: AddressType.MIDNIGHT,
        input: JSON.stringify({
          tx: serializedTx,
          circuitId: circuitId,
        }),
        timestamp: Date.now(),
      },
      confirmationLevel: "wait-receipt",
    };

    const response = await fetch(`${batcherUrl}/send-input`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const result = await response.json();
    if (!response.ok || !result.success) {
      throw new Error(`Batcher failed: ${result.message || response.statusText}`);
    }
    
    console.log("📬 Batcher accepted transaction:", result);
    return result;
  };

  const refreshMidnightCounter = async () => {
    if (!midnightProviders || !midnightContract) return;
    try {
      const contractAddress = midnightContract.deployTxData.public.contractAddress;
      const state = await counter.getCounterLedgerState(midnightProviders, contractAddress);
      if (state) {
        setMidnightCounterValue(state.round);
      }
    } catch (e) {
      console.error("Failed to refresh counter:", e);
    }
  };

  const pollForMidnightConfirmation = async (txHash: string) => {
    console.log(`Polling for confirmation of ${txHash}...`);
    for (let i = 0; i < 60; i++) { // Poll for up to 2 mins (2s intervals)
      const confirmed = await counter.queryTransactionStatus(txHash);
      if (confirmed) {
        console.log("Transaction confirmed!");
        setActionResult(`Transaction successful and confirmed: ${txHash}`);
        await refreshMidnightCounter();
        return;
      }
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
    setActionResult("Polling timed out. Please refresh manually later.");
  };

  const handleMidnightIncrement = async (delegated: boolean) => {
    if (!midnightContract || !midnightAddresses) return;
    counter.setUseDelegatedBalancing(delegated);
    setActionResult(null);
    try {
      const result = await counter.increment(midnightContract);
      console.log("Increment result:", result);
      setActionResult(`Transaction successful: ${result.txId}`);
      await refreshMidnightCounter();
    } catch (error) {
      if (error instanceof counter.DelegatedBalancingSentError) {
        const tx = counter.getLastCapturedTx();
        if (!tx) throw new Error("No transaction captured for delegation");
        const res = await submitToBatcher(tx, "increment", midnightAddresses.shieldedAddress);
        setActionResult("Transaction delegated to batcher. Polling for confirmation...");
        pollForMidnightConfirmation(res.transactionHash);
        return;
      }
      console.error("Increment failed:", error);
      setError(error instanceof Error ? error.message : String(error));
    }
  };

  const handleConnectInjected = (mode: WalletMode, wallet: any) => {
    handleLogin(() => {
      let checkChainId = true;
      if (
           wallet.metadata.name === "io.xdefi"
        || wallet.metadata.name === "app.phantom" 
        || wallet.metadata.name === "com.exodus.web3-wallet") {
        checkChainId= false;
      }
      
      return walletLogin(({
        mode,
        preference: { name: wallet.metadata.name },
        preferBatchedMode: false,
        chain: mode === WalletMode.EvmInjected || WalletMode.EvmEthers ? network : undefined,
        checkChainId,
      } as any))
    }, mode);
  };

  const handleInputChange = (path: string, value: any) => {
    setFormValues((prev) => {
      const newValues = { ...prev };
      let current = newValues;
      const parts = path.split(".");
      for (let i = 0; i < parts.length - 1; i++) {
        current = current[parts[i]];
      }
      current[parts[parts.length - 1]] = value;
      return newValues;
    });
  };

  const renderInput = (name: string, schema: any, path: string) => {
    if (
      schema.anyOf && Array.isArray(schema.anyOf) &&
      schema.anyOf.every((i: any) => i.const)
    ) {
      return (
        <select
          value={formValues[path] || ""}
          onChange={(e) => handleInputChange(path, e.target.value)}
        >
          {schema.anyOf.map((option: any) => (
            <option key={option.const} value={option.const}>
              {option.const}
            </option>
          ))}
        </select>
      );
    }

    if (schema.type === "object") {
      if (schema.properties) {
        return (
          <div style={{ paddingLeft: "20px", borderLeft: "1px solid #ccc" }}>
            {Object.entries(schema.properties).map(([propName, propSchema]) => (
              <div key={propName}>
                <label>{propName}:</label>
                {renderInput(propName, propSchema, `${path}.${propName}`)}
              </div>
            ))}
          </div>
        );
      } else {
        // For complex objects or recursive schemas, render a textarea for JSON input
        return (
          <textarea
            value={typeof formValues[name] === "object"
              ? JSON.stringify(formValues[name], null, 2)
              : formValues[name]}
            onChange={(e) => handleInputChange(path, e.target.value)}
            rows={10}
            style={{ width: "100%" }}
          />
        );
      }
    }

    const inputType = schema.type === "integer" ? "number" : "text";
    const value =
      path.split(".").reduce((acc, part) => acc?.[part], formValues) ?? "";

    return (
      <input
        type={inputType}
        value={typeof value === "object" ? JSON.stringify(value) : value}
        onChange={(e) => handleInputChange(path, e.target.value)}
      />
    );
  };

  const availableWallets = useMemo(() => {
    const wallets: {
      name: string;
      mode: WalletMode;
      login: () => void;
      types: string[];
      metadata: any;
    }[] = [];

    if (injectedWallets) {
      for (const [modeStr, walletList] of Object.entries(injectedWallets)) {
        const mode = Number(modeStr) as WalletMode;
        if (Array.isArray(walletList) && walletList.length > 0) {
          for (const wallet of walletList as any[]) {
            // Get a lower-case network type like 'evm' or 'cardano' from the wallet mode.
            const networkType = WalletNameMap[mode].toLowerCase();

            wallets.push({
              name: wallet.metadata.displayName,
              mode,
              login: () => handleConnectInjected(mode, wallet),
              types: [networkType],
              metadata: wallet.metadata,
            });
          }
        }
      }
    }

    wallets.push({
      name: "EVM (Viem Local Wallet)",
      mode: WalletMode.EvmEthers,
      login: () =>
        handleLogin(() =>
          walletLogin({
            mode: WalletMode.EvmEthers,
            connection: {
              metadata: {
                name: "Viem Local Wallet",
                displayName: "Viem Local Wallet",
              },
              api: clientToSigner(viemClient),
            },
            preferBatchedMode: false,
          }),
          WalletMode.EvmEthers,
        ),
      types: ["evm"],
      metadata: {
        name: "Viem Local Wallet",
        displayName: "EVM (Viem Local Wallet)",
      },
    });

    wallets.push({
      name: "EVM [test error]",
      mode: WalletMode.EvmInjected,
      login: () =>
        handleLogin(() =>
          walletLogin({
            mode: WalletMode.EvmInjected,
            preference: { name: "No wallet" },
            preferBatchedMode: false,
            checkChainId: true,
            chain: paimaEngineConfig.paimaL2Chain,
          }),
          WalletMode.EvmInjected,
        ),
      types: ["evm"],
      metadata: {
        name: "EVM Test Error",
        displayName: "EVM [test error]",
      },
    });

    wallets.push({
      name: "Connect Midnight Wallet",
      mode: WalletMode.Midnight,
      login: async () => {
        try {
          setError(null);
          const result = await walletLogin({
            mode: WalletMode.Midnight,
            networkId: "undeployed",
          });
          if (result.success) {
            const paimaWallet = result.result;
            const connectedApi = paimaWallet.provider.getConnection().api as ConnectedAPI;

            // Connect to providers and contract
            const { providers, addresses } = await counter.connectMidnightWallet(connectedApi);
            const { contract, state, contractAddress } = await counter.connectToContract(providers);

            // Log wallet addresses
            logMidnightWalletAddresses(addresses);

            setWallet({ ...result.result, mode: WalletMode.Midnight });
            setMidnightProviders(providers);
            setMidnightAddresses(addresses);
            setMidnightContract(contract);
            if (state) setMidnightCounterValue(state.round);
            setAddressType(AddressType.MIDNIGHT);
          } else {
            setError(result.errorMessage);
          }
        } catch (e) {
          setError(e instanceof Error ? e.message : String(e));
        }
      },
      types: ["midnight"],
      metadata: {
        name: "Midnight Wallet",
        displayName: "Midnight Wallet",
      },
    });

    return wallets;
  }, [injectedWallets]);

  const displayedWallets = useMemo(() => {
    if (!selectedPrimitive || selectedPrimitive.name === "Show All Wallets") {
      return availableWallets;
    }
    if (selectedPrimitive.type === "evm-rpc-effectstream-l2") {
      return availableWallets;
    }
    return availableWallets.filter((wallet) =>
      wallet.types.includes(selectedPrimitive.networkType)
    );
  }, [selectedPrimitive, availableWallets]);

  const handleSignMessage = async () => {
    if (!wallet) return;
    setActionResult(null);
    setSignatureVerification(null);
    setMessageToVerify(null);
    setSignatureToVerify(null);
    setVerificationArgs(null);
    try {
      const signedMessage = await signMessage(
        wallet,
        messageToSign,
      );
      console.log(signedMessage);
      setActionResult(JSON.stringify(signedMessage, null, 2));
      setMessageToVerify(messageToSign);
      setSignatureToVerify(signedMessage);
      if (wallet) {
        setEditableUserAddress(wallet.walletAddress);
      }
      setEditableMessage(messageToSign);
      setEditableSignature(signedMessage);
    } catch (e) {
      setActionResult(`Error: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const handleSendBatcherTransaction = async () => {
    if (!wallet) return;
    setActionResult(null);
    setSignatureVerification(null);
    setMessageToVerify(null);
    setSignatureToVerify(null);
    setVerificationArgs(null);
    setActionResult("Sending signed message to batcher...");
    try {
      const result = await sendBatcherTransaction(
        wallet,
        JSON.parse(messageToBatch),
        paimaEngineConfig,
        "wait-effectstream-processed",
      );
      console.log(result);
      setActionResult(
        `Batcher transaction sent. Result: ${JSON.stringify(result, null, 2)}`,
      );
    } catch (e) {
      setActionResult(`Error: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const handleVerifySignature = async () => {
    if (!wallet) return;

    try {
      let isCorrect = false;
      const { mode } = wallet;
      const addressType = getAddressType(mode);
      const args: { userAddress: string; message: string; signature: string; cryptoManager?: string } = {
        userAddress: editableUserAddress,
        message: editableMessage,
        signature: editableSignature,
      };

      const cryptoManager = CryptoManager.getCryptoManager(addressType);
      args.cryptoManager = cryptoManager.constructor.name;
      isCorrect = await cryptoManager.verifySignature(args.userAddress, args.message, args.signature);
      setVerificationArgs(args);
      setSignatureVerification(isCorrect);
    } catch (e) {
      setActionResult(`Error: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const handleFunctionSelect = (func: string) => {
    setSelectedFunction(func);
    const args = grammar[func as keyof typeof grammar];
    const initialFormValues: Record<string, any> = {};
    if (args) {
      for (const [name, schema] of args) {
        if (schema.type === "object" && schema.properties) {
          initialFormValues[name] = {};
          for (const propName in schema.properties) {
            initialFormValues[name][propName] = "";
          }
        } else if (schema.anyOf) {
          initialFormValues[name] = schema.anyOf[0].const;
        } else {
          initialFormValues[name] = "";
        }
      }
    }
    setFormValues(initialFormValues);
    setActionResult(null);
  };

  const handleSubmit = async () => {
    setActionResult(null);
    setSignatureVerification(null);
    if (!wallet || !selectedFunction) return;

    try {
      console.log(formValues);
      const conciseData = [selectedFunction, ...Object.values(formValues)];

      switch (selectedAction) {
        case "signMessage": {
          const signedMessage = await signMessage(
            wallet,
            JSON.stringify(formValues),
          );
          console.log(signedMessage);
          setActionResult(JSON.stringify(signedMessage, null, 2));
          break;
        }
        case "sendTransaction": {
          const result = await sendTransaction(
            wallet,
            conciseData,
            paimaEngineConfig,
            "wait-effectstream-processed",
          );
          console.log(result);
          setActionResult(
            `Transaction sent. Result: ${JSON.stringify(result, null, 2)}`,
          );
          break;
        }
        case "sendBatcherTransaction": {
          const result = await sendBatcherTransaction(
            wallet,
            conciseData,
            paimaEngineConfig,
            "wait-effectstream-processed",
          );
          console.log(result);
          setActionResult(
            `Batcher transaction sent. Result: ${
              JSON.stringify(result, null, 2)
            }`,
          );
          break;
        }
      }
    } catch (e) {
      setActionResult(`Error: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const renderForm = () => {
    if (!selectedFunction) return null;

    const args = grammar[selectedFunction as keyof typeof grammar];

    return (
      <div>
        <h3>{selectedFunction}</h3>
        {args && args.length > 0
          ? args.map(([name, schema]) => (
            <div key={name} className="form-field">
              <label>{name}:</label>
              {renderInput(name, schema, name)}
            </div>
          ))
          : <p>This function takes no arguments.</p>}
        <div className="form-buttons">
          <select
            value={selectedAction}
            onChange={(e) => setSelectedAction(e.target.value)}
          >
            <option value="signMessage">Sign Message</option>
            <option value="sendTransaction">Send Transaction</option>
            <option value="sendBatcherTransaction">
              Send Batcher Transaction
            </option>
          </select>
          <button type="button" onClick={handleSubmit}>Submit</button>
          <button
            type="button"
            onClick={() => setSelectedFunction(null)}
            className="back-button"
          >
            Back
          </button>
        </div>
        {actionResult && (
          <div className="info-box result-box">
            <h3>Result</h3>
            <pre>{actionResult}</pre>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="container">
      <h1>E2E Wallets</h1>

      <div style={{ display: "flex", gap: "2rem", flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: "300px" }}>
          <h2>Select a Primitive</h2>
          <div className="card primitives-list">
            {primitives.map((primitive) => (
              <div key={primitive.name} style={{ display: 'grid', gridTemplateColumns: '1fr auto', alignItems: 'center', gap: '1rem' }}>
                <div>
                  <input
                    type="radio"
                    id={primitive.name}
                    name="primitive"
                    value={primitive.name}
                    checked={selectedPrimitive?.name === primitive.name}
                    onChange={() => handlePrimitiveChange(primitive)}
                  />
                  <label htmlFor={primitive.name} style={{ marginLeft: '0.5rem' }}>
                    <strong>{primitive.name}</strong>
                  </label>
                </div>
                {primitive.syncProtocol && (
                  <i style={{ color: 'white' }}>@ {primitive.syncProtocol}</i>
                )}
              </div>
            ))}
          </div>
        </div>

        <div style={{ flex: 1, minWidth: "300px" }}>
          <h2>Wallets</h2>
          <div
            className="card"
            style={{
              flexDirection: "row",
              alignItems: "flex-start",
              flexWrap: "wrap",
              gap: "10px",
            }}
          >
            {displayedWallets.length > 0
              ? (
                displayedWallets.map((wallet) => (
                  <div
                    key={`${wallet.metadata.name} :: ${wallet.mode}`}
                    onClick={wallet.login}
                    style={{
                      display: "flex",
                      flexGrow: 1,
                      flexDirection: "row",
                      alignItems: "center",
                      gap: "1rem",
                      padding: "12px",
                      background: "rgba(255, 255, 255, 0.05)",
                      borderRadius: "8px",
                      cursor: "pointer",
                      border: "1px solid rgba(255, 255, 255, 0.1)",
                      transition: "all 0.2s ease",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background =
                        "rgba(255, 255, 255, 0.1)";
                      e.currentTarget.style.transform = "translateX(5px)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background =
                        "rgba(255, 255, 255, 0.05)";
                      e.currentTarget.style.transform = "translateX(0)";
                    }}
                    title={`Connect to ${wallet.metadata.displayName}`}
                  >
                    {wallet.metadata.icon
                      ? (
                        <img
                          src={wallet.metadata.icon}
                          alt={wallet.metadata.displayName}
                          style={{
                            width: "32px",
                            height: "32px",
                            borderRadius: "4px",
                          }}
                        />
                      )
                      : (
                        <div
                          style={{
                            width: "32px",
                            height: "32px",
                            borderRadius: "4px",
                            background: "#4a5568",
                            display: "flex",
                            justifyContent: "center",
                            alignItems: "center",
                            fontWeight: "bold",
                            color: "white",
                          }}
                        >
                          <span>
                            {wallet.metadata.displayName.charAt(0)}
                          </span>
                        </div>
                      )}
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "flex-start",
                      }}
                    >
                      <p
                        style={{
                          margin: 0,
                          fontWeight: "bold",
                          color: "white",
                        }}
                      >
                        {wallet.metadata.displayName}
                      </p>
                      <p
                        style={{
                          margin: 0,
                          fontSize: "0.8rem",
                          color: "#aaa",
                        }}
                      >
                        {wallet.metadata.name}
                      </p>
                      <p
                        style={{
                          margin: 0,
                          fontSize: "0.7rem",
                          color: "#888",
                          textTransform: "capitalize",
                          fontWeight: "bold",
                        }}
                      >
                        {wallet.types.join(", ")}
                      </p>
                    </div>
                  </div>
                ))
              )
              : (
                <p style={{ color: "white" }}>
                  {selectedPrimitive
                    ? "No compatible wallets found."
                    : "Select a primitive to see available wallets."}
                </p>
              )}
          </div>
        </div>
      </div>

      {wallet && (
        <div style={{ display: "flex", gap: "2rem", marginTop: "2rem" }}>
          {/* Left Column: Logs */}
          <div style={{ flex: '0 0 50%' }}>
            <div className="info-box">
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "10px",
                }}
              >
                {wallet.metadata?.icon && (
                  <img
                    src={wallet.metadata.icon}
                    width="35"
                    height="34"
                    alt="wallet icon"
                  />
                )}
                <h2>Wallet Info</h2>
              </div>
              <div>
                <p><strong>Address:</strong> {wallet.walletAddress}</p>
                <p>
                  <strong>Address Validity:</strong>{" "}
                  {isAddressValid === true
                    ? "✅ Valid"
                    : isAddressValid === false
                    ? "❌ Invalid"
                    : "⏳ Unknown"}
                </p>
                <p><strong>Metadata:</strong></p>
                <pre>
                  {JSON.stringify(wallet.metadata || {}, null, 2)}
                </pre>
              </div>
            </div>
            {selectedPrimitive && (
              <div
                className="info-box-large info-box"
                style={{ marginTop: "1rem" }}
              >
                {selectedPrimitive.type === "EVM:PaimaL2"
                  ? (selectedFunction ? renderForm() : (
                    <div>
                      <h2>Select a function</h2>
                      <div className="card">
                        {Object.keys(grammar).map((func) => (
                          <button
                            key={func}
                            type="button"
                            onClick={() => handleFunctionSelect(func)}
                          >
                            {func}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))
                  : selectedPrimitive.name !== "Show All Wallets"
                  ? (
                    <div>
                      <p>
                        To interact with this contract, use the native wallet
                      </p>
                      <pre>{JSON.stringify(selectedPrimitive, null, 2)}</pre>
                    </div>
                  )
                  : null}
              </div>
            )}
          </div>

          {/* Right Column: Actions */}
          <div style={{ flex: '0 0 50%' }}>
            <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <h2>Actions</h2>
              <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto', gap: '1rem', alignItems: 'center' }}>
                <label style={{ color: 'white' }}>Sign Message:</label>
                <input
                  type="text"
                  value={messageToSign}
                  onChange={(e) => setMessageToSign(e.target.value)}
                  placeholder="message to sign"
                  style={{
                    padding: "8px",
                    borderRadius: "4px",
                    border: "1px solid #ccc",
                    width: "100%",
                  }}
                />
                <button
                  type="button"
                  onClick={handleSignMessage}
                  disabled={!messageToSign}
                  style={{ width: "80px" }}
                >
                  Sign
                </button>

                <label style={{ color: 'white' }}>Send to Batcher:</label>
                <input
                  type="text"
                  value={messageToBatch}
                  onChange={(e) => setMessageToBatch(e.target.value)}
                  placeholder='["attack","1","1"]'
                  style={{
                    padding: "8px",
                    borderRadius: "4px",
                    border: "1px solid #ccc",
                    width: "100%",
                  }}
                />
                <button
                  type="button"
                  onClick={handleSendBatcherTransaction}
                  disabled={!messageToBatch}
                  style={{ width: "80px" }}
                >
                  Send
                </button>
              </div>

              {wallet?.mode === WalletMode.Midnight && (
                <div style={{ marginTop: "1rem", borderTop: "1px solid rgba(255, 255, 255, 0.1)", paddingTop: "1rem" }}>
                  <h3>Midnight Counter Actions</h3>
                  <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                    <div style={{ padding: '15px', background: 'rgba(255,255,255,0.05)', borderRadius: '8px', textAlign: 'center' }}>
                      <p style={{ margin: 0, fontSize: '0.9rem', opacity: 0.7 }}>Current Counter Value</p>
                      <p style={{ margin: '5px 0 0 0', fontSize: '2rem', fontWeight: 'bold', color: '#4a90e2' }}>
                        {typeof midnightCounterValue === 'bigint' ? midnightCounterValue.toString() : "..."}
                      </p>
                    </div>

                    <button 
                      type="button" 
                      onClick={() => handleMidnightIncrement(false)}
                      style={{ padding: "10px", background: "#4a90e2", color: "white", border: "none", borderRadius: "4px", cursor: "pointer" }}
                    >
                      Increment (Direct)
                    </button>
                    <button 
                      type="button" 
                      onClick={() => handleMidnightIncrement(true)}
                      style={{ padding: "10px", background: "#4a90e2", color: "white", border: "none", borderRadius: "4px", cursor: "pointer" }}
                    >
                      Increment (Delegated)
                    </button>
                  </div>
                </div>
              )}
            </div>

            {actionResult && (
              <div className="info-box result-box" style={{ marginTop: "1rem" }}>
                <h3>Result</h3>
                <pre>{actionResult}</pre>
              </div>
            )}

            {signatureToVerify && (
              <div className="card info-box" style={{ marginTop: "1rem" }}>
                <div style={{ display: 'flex', flexDirection: 'row', gap: '0.5rem' }}>
                  <h3>Verify Signature</h3>
                  <div className="form-field" style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                    <label>User Address:</label>
                    <input type="text" value={editableUserAddress} onChange={(e) => setEditableUserAddress(e.target.value)} style={{ width: '100%', boxSizing: 'border-box' }} />
                  </div>
                  <div className="form-field" style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                    <label>Message:</label>
                    <input type="text" value={editableMessage} onChange={(e) => setEditableMessage(e.target.value)} style={{ width: '100%', boxSizing: 'border-box' }} />
                  </div>
                  <div className="form-field" style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                    <label>Signature:</label>
                    <input type="text" value={editableSignature} onChange={(e) => setEditableSignature(e.target.value)} style={{ width: '100%', boxSizing: 'border-box' }} />
                  </div>
                  <button
                    type="button"
                    onClick={handleVerifySignature}
                    style={{ marginTop: '0.5rem' }}
                  >
                    Verify Signature
                  </button>
                </div>
              </div>
            )}

            {verificationArgs && (
              <div className="info-box result-box" style={{ marginTop: "1rem" }}>
                <h3>Signature Verification Arguments</h3>
                <pre>{JSON.stringify(verificationArgs, null, 2)}</pre>
              </div>
            )}

            {signatureVerification !== null && (
              <div className="info-box result-box" style={{ marginTop: "1rem" }}>
                <h3>Signature Verification</h3>
                <p>{signatureVerification ? '✅ Signature is valid' : '❌ Signature is invalid'}</p>
              </div>
            )}
          </div>
        </div>
      )}

      {error && (
        <div className="info-box error-box">
          <h2>Error</h2>
          <pre>{error}</pre>
        </div>
      )}
    </div>
  );
}

export default App;
