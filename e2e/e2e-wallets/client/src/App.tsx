import { useState } from "react";
import "./App.css";

import { WalletMode, WalletNameMap, allInjectedWallets, walletLogin, type Wallet } from "@paima/wallets";
import { signMessage, sendTransaction, sendBatcherTransaction } from "@paima/wallets";

import { createWalletClient, http } from 'viem'
import { hardhat } from 'viem/chains'
import { privateKeyToAccount } from 'viem/accounts'
import { BrowserProvider, JsonRpcSigner } from 'ethers'
import { useMemo } from "react";
import { grammar } from "@e2e/data-types";
import { localhostConfig } from "@e2e/data-types";

// TODO Move this to @paima/wallets

const chainIdToWalletType = (chainId: WalletMode): string => {
  return WalletNameMap[chainId] || `Unknown (${chainId})`;
};
// Local Wallet
const viemAccount = privateKeyToAccount('0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80') 
const viemClient = createWalletClient({
  account: viemAccount,
  chain: hardhat,
  transport: http()
});

const InjectedWalletsPopup = ({ wallets, onClose }: { wallets: Record<WalletMode, any> | null, onClose: () => void }) => {
  if (!wallets) return null;

  return (
    <div className="popup-overlay">
      <div className="popup-content">
        <button type="button" onClick={onClose} className="close-button">X</button>
        <h2>Available Injected Wallets</h2>
        {Object.entries(wallets).map(([chainId, walletList]) => (
          <div key={chainId}>
            <h3>{chainIdToWalletType(chainId as unknown as WalletMode)}</h3>
            <div className="wallets-grid">
              {(walletList as any[]).length > 0 ? (
                (walletList as any[]).map(wallet => (
                  <div key={wallet.metadata.name} className="wallet-item">
                    {wallet.metadata.icon ? (
                      <img src={wallet.metadata.icon} alt={wallet.metadata.displayName} />
                    ) : (
                      <div className="wallet-icon-placeholder">
                        <span>{wallet.metadata.displayName.charAt(0)}</span>
                      </div>
                    )}
                    <p>{wallet.metadata.displayName}</p>
                    <p>[{wallet.metadata.name}]</p>
                  </div>
                ))
              ) : (
                <p>No injected wallets found for this chain.</p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

interface PrimitiveInfo {
  name: string;
  syncProtocol: string;
  network: string;
  signature: string;
  type: string;
  networkType: string;
}

// localhostConfig.primitives['evm-rpc-paima-l2'].primitive.abi = paimaL2Abi;
/** Convert Viem to Ether Signer *//** Hook to convert a viem Wallet Client to an ethers.js Signer. */
function clientToSigner(client: any) { // Client<Transport, Chain, Account>) {
  const { account, chain, transport } = client
  const network = {
    chainId: chain.id,
    name: chain.name,
    ensAddress: chain.contracts?.ensRegistry?.address,
  }
  const provider = new BrowserProvider(transport, network)
  const signer = new JsonRpcSigner(provider, account.address)
  return signer
}


function App() {
  const [error, setError] = useState<string | null>(null);
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [selectedFunction, setSelectedFunction] = useState<string | null>(null);
  const [formValues, setFormValues] = useState<Record<string, any>>({});
  const [selectedPrimitive, setSelectedPrimitive] = useState<PrimitiveInfo | null>(null);
  const [actionResult, setActionResult] = useState<string | null>(null);
  const [selectedAction, setSelectedAction] = useState<string>('signMessage');
  const [showInjectedWalletsPopup, setShowInjectedWalletsPopup] = useState(false);
  const [injectedWallets, setInjectedWallets] = useState<Record<WalletMode, any> | null>(null);

  const primitives = useMemo<PrimitiveInfo[]>(() => {
    return Object.entries(localhostConfig.primitives).map(([name, primitiveData]: [string, any]) => {
      const syncProtocol = primitiveData.syncProtocol;
      // @ts-ignore - TODO: fix types in config
      const network = localhostConfig.syncProtocols.parallel[syncProtocol]?.network || '';
      // @ts-ignore - TODO: fix types in config
      const networkType = localhostConfig.allNetworks.networks[network]?.type || 'unknown';

      const abi = primitiveData?.primitive?.abi;
      const signature = abi
        ? `${abi.name}(${
            // @ts-ignore - TODO: fix types in config
            abi.inputs.map((i: any) => `${i.name}:${i.type}`).join(', ')
          })`
        : 'No ABI';

      return {
        name,
        syncProtocol,
        network,
        signature,
        type: primitiveData.primitive.type,
        networkType,
      };
    });
  }, []);

  const handleLogin = async (loginAction: () => Promise<any>) => {
    setError(null);
    setWallet(null);
    setSelectedFunction(null);
    setFormValues({});
    setActionResult(null);
    try {
      const result = await loginAction();
      if (result.success) {
        setWallet(result.result);
        
        console.log('wallet set', result.result);
      } else {
        setError(result.errorMessage);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };
  
  const handleShowInjectedWallets = async () => {
    const wallets = await allInjectedWallets() as unknown as Record<WalletMode, any>;
    setInjectedWallets(wallets);
    setShowInjectedWalletsPopup(true);
  };

  const handleInputChange = (path: string, value: any) => {
    setFormValues(prev => {
      const newValues = { ...prev };
      let current = newValues;
      const parts = path.split('.');
      for (let i = 0; i < parts.length - 1; i++) {
        current = current[parts[i]];
      }
      current[parts[parts.length - 1]] = value;
      return newValues;
    });
  };
  
  const renderInput = (name: string, schema: any, path: string) => {
    if (schema.anyOf && Array.isArray(schema.anyOf) && schema.anyOf.every((i: any) => i.const)) {
        return (
            <select value={formValues[path] || ''} onChange={(e) => handleInputChange(path, e.target.value)}>
                {schema.anyOf.map((option: any) => (
                    <option key={option.const} value={option.const}>{option.const}</option>
                ))}
            </select>
        );
    }

    if (schema.type === 'object') {
        if (schema.properties) {
            return (
                <div style={{ paddingLeft: '20px', borderLeft: '1px solid #ccc' }}>
                    {Object.entries(schema.properties).map(([propName, propSchema]) => (
                        <div key={propName}>
                            <label>{propName}: </label>
                            {renderInput(propName, propSchema, `${path}.${propName}`)}
                        </div>
                    ))}
                </div>
            );
        } else {
            // For complex objects or recursive schemas, render a textarea for JSON input
            return <textarea 
              value={typeof formValues[name] === 'object' ? JSON.stringify(formValues[name], null, 2) : formValues[name]}
              onChange={(e) => handleInputChange(path, e.target.value)}
              rows={10}
              style={{width: '100%'}}
            />;
        }
    }
    
    const inputType = schema.type === 'integer' ? 'number' : 'text';
    const value = path.split('.').reduce((acc, part) => acc?.[part], formValues) ?? '';

    return <input type={inputType} value={value} onChange={(e) => handleInputChange(path, e.target.value)} />;
  };

  const availableWallets = useMemo(() => [
    {
      name: 'EVM Injected',
      mode: WalletMode.EvmInjected,
      login: () => handleLogin(() => walletLogin({
        mode: WalletMode.EvmInjected,
        preference: { name: "io.metamask" },
        preferBatchedMode: false,
        checkChainId: false,
      })),
      types: ['evm'],
    },
    {
      name: 'EVM (Phantom)',
      mode: WalletMode.EvmInjected,
      login: () => handleLogin(() => walletLogin({
        mode: WalletMode.EvmInjected,
        preference: { name: "app.phantom" },
        preferBatchedMode: false,
        checkChainId: false,
      })),
      types: ['evm'],
    },
    {
      name: 'EVM [test error]',
      mode: WalletMode.EvmInjected,
      login: () => handleLogin(() => walletLogin({
        mode: WalletMode.EvmInjected,
        preference: { name: "No wallet" },
        preferBatchedMode: false,
        checkChainId: false,
      })),
      types: ['evm'],
    },
    {
      name: 'EVM (Viem Local Wallet)',
      mode: WalletMode.EvmEthers,
      login: () => handleLogin(() => walletLogin({
        mode: WalletMode.EvmEthers,
        connection: {
          metadata: {
            name: 'Viem Local Wallet',
            displayName: 'Viem Local Wallet',
          },
          api: clientToSigner(viemClient),
        },
        preferBatchedMode: false,
      })),
      types: ['evm'],
    },
    {
      name: 'Cardano (Subwallet)',
      mode: WalletMode.Cardano,
      login: () => handleLogin(() => walletLogin({
        mode: WalletMode.Cardano,
        preference: { name: "subwallet" },
      })),
      types: ['cardano'],
    },
    {
      name: 'Cardano (Eternl)',
      mode: WalletMode.Cardano,
      login: () => handleLogin(() => walletLogin({
        mode: WalletMode.Cardano,
        preference: { name: "eternl" },
      })),
      types: ['cardano'],
    },
    {
      name: 'Cardano (Exodus)',
      mode: WalletMode.Cardano,
      login: () => handleLogin(() => walletLogin({
        mode: WalletMode.Cardano,
        preference: { name: "exodus" },
      })),
      types: ['cardano'],
    },
    {
      name: 'Cardano (Lace)',
      mode: WalletMode.Cardano,
      login: () => handleLogin(() => walletLogin({
        mode: WalletMode.Cardano,
        preference: { name: "lace" },
      })),
      types: ['cardano'],
    },
    {
      name: 'Polkadot',
      mode: WalletMode.Polkadot,
      login: () => handleLogin(() => walletLogin({ mode: WalletMode.Polkadot })),
      types: ['polkadot'],
    },
    {
      name: 'Algorand',
      mode: WalletMode.Algorand,
      login: () => handleLogin(() => walletLogin({
        mode: WalletMode.Algorand,
        preference: { name: "exodus" },
      })),
      types: ['algorand'],
    },
    {
      name: 'Mina',
      mode: WalletMode.Mina,
      login: () => handleLogin(() => walletLogin({ mode: WalletMode.Mina })),
      types: ['mina'],
    },
    {
      name: 'Midnight',
      mode: WalletMode.Midnight,
      login: () => handleLogin(() => walletLogin({ mode: WalletMode.Midnight })),
      types: ['midnight'],
    },
  ], []);

  const displayedWallets = useMemo(() => {
    if (!selectedPrimitive) {
      return [];
    }
    if (selectedPrimitive.type === 'evm-rpc-paima-l2') {
      return availableWallets;
    }
    return availableWallets.filter(wallet => wallet.types.includes(selectedPrimitive.networkType));
  }, [selectedPrimitive, availableWallets]);

  const handleFunctionSelect = (func: string) => {
    setSelectedFunction(func);
    const args = grammar[func as keyof typeof grammar];
    const initialFormValues: Record<string, any> = {};
    if (args) {
      for (const [name, schema] of args) {
        if (schema.type === 'object' && schema.properties) {
          initialFormValues[name] = {};
          for (const propName in schema.properties) {
            initialFormValues[name][propName] = '';
          }
        } else if (schema.anyOf) {
            initialFormValues[name] = schema.anyOf[0].const;
        }
        else {
          initialFormValues[name] = '';
        }
      }
    }
    setFormValues(initialFormValues);
    setActionResult(null);
  };

  const handleSubmit = async () => {
    setActionResult(null);
    if (!wallet || !selectedFunction) return;

    try {
      console.log(formValues);
      const conciseData = [selectedFunction, ...Object.values(formValues)];

      switch (selectedAction) {
        case 'signMessage': {
          const signedMessage = await signMessage(wallet, JSON.stringify(formValues));
          console.log(signedMessage);
          setActionResult(JSON.stringify(signedMessage, null, 2));
          break;
        }
        case 'sendTransaction': {
          const result = await sendTransaction(wallet,
            '0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512',
            conciseData
          );
          console.log(result);
          setActionResult(`Transaction sent. Result: ${JSON.stringify(result, null, 2)}`);
          break;
        }
        case 'sendBatcherTransaction': {
          const result = await sendBatcherTransaction(wallet, conciseData);
          console.log(result);
          setActionResult(`Batcher transaction sent. Result: ${JSON.stringify(result, null, 2)}`);
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
        {args && args.length > 0 ? args.map(([name, schema]) => (
          <div key={name} className="form-field">
            <label>{name}:</label>
            {renderInput(name, schema, name)}
          </div>
        )) : <p>This function takes no arguments.</p>}
        <div className="form-buttons">
            <select value={selectedAction} onChange={e => setSelectedAction(e.target.value)}>
              <option value="signMessage">Sign Message</option>
              <option value="sendTransaction">Send Transaction</option>
              <option value="sendBatcherTransaction">Send Batcher Transaction</option>
            </select>
            <button type="button" onClick={handleSubmit}>Submit</button>
            <button type="button" onClick={() => setSelectedFunction(null)} className="back-button">Back</button>
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

      <h2>Select a Primitive</h2>
      <div className="card primitives-list">
        {primitives.map(primitive => (
          <div key={primitive.name}>
            <input
              type="radio"
              id={primitive.name}
              name="primitive"
              value={primitive.name}
              checked={selectedPrimitive?.name === primitive.name}
              onChange={() => setSelectedPrimitive(primitive)}
            />
            <label htmlFor={primitive.name}>
              <strong>{primitive.name}</strong> (sync: {primitive.syncProtocol}) - <i>{primitive.signature}</i>
            </label>
          </div>
        ))}
      </div>

      <h2>Connect Wallet</h2>
      <div className="card">
        <button className="button-2" type="button" onClick={handleShowInjectedWallets}>
          Show Injected Wallets
        </button>
        
        {displayedWallets.map(wallet => (
          <button key={wallet.name} type="button" onClick={wallet.login}>
            {wallet.name}
          </button>
        ))}

      </div>

      {wallet && (
        <div className="info-box">
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            {wallet.metadata?.icon && <img src={wallet.metadata.icon} width="35" height="34" alt="wallet icon" />}
            <h2>Wallet Info</h2>
          </div>
          <pre>{JSON.stringify({walletAddress: wallet.walletAddress, metadata: wallet.metadata }, null, 2)}</pre>
        </div>
      )}

      {wallet && selectedPrimitive && (
        <div className="info-box-large info-box">
          {selectedPrimitive.type === 'evm-rpc-paima-l2'
            ? (selectedFunction
              ? renderForm()
              : (
                <div>
                  <h2>Select a function</h2>
                  <div className="card">
                    {Object.keys(grammar).map(func => (
                      <button key={func} type="button" onClick={() => handleFunctionSelect(func)}>
                        {func}
                      </button>
                    ))}
                  </div>
                </div>
              ))
            : (
              <div>
                <p>To interact with this contract, use the native wallet</p>
                <pre>{JSON.stringify(selectedPrimitive, null, 2)}</pre>
              </div>
            )}
        </div>
      )}

      {showInjectedWalletsPopup && (
        <InjectedWalletsPopup
          wallets={injectedWallets}
          onClose={() => setShowInjectedWalletsPopup(false)}
        />
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
