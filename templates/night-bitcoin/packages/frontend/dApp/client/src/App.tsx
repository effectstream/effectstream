import { useState, useEffect } from "react";
import "./App.css";
import * as paima from './paima.ts';

// Mock data for tokens and quotes
const tokens = [
  { id: 'btc', name: 'Bitcoin', symbol: 'BTC' },
  // { id: 'eth', name: 'Ethereum', symbol: 'ETH' },
  { id: 'm20', name: 'Midnight Token', symbol: 'M20' },
];

const formatNumber = (n: number | string) => {
  const num = typeof n === 'string' ? parseFloat(n) : n;
  if (isNaN(num)) return n;

  if (num >= 1) {
    return num.toLocaleString('en-US', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 3,
      useGrouping: false,
    });
  }

  if (num === 0) return '0';

  // toFixed(20) to get a string representation for small numbers without scientific notation
  const fullDecimalString = num.toFixed(20).split('.')[1];
  if (!fullDecimalString) return num.toString();

  let firstNonZeroIndex = -1;
  for (let i = 0; i < fullDecimalString.length; i++) {
    if (fullDecimalString[i] !== '0') {
      firstNonZeroIndex = i;
      break;
    }
  }

  if (firstNonZeroIndex === -1) {
    return '0';
  }

  const decimalPlacesToKeep = firstNonZeroIndex + 4;
  return num.toFixed(decimalPlacesToKeep);
};

function App() {
  const [fromToken, setFromToken] = useState(tokens[0].symbol);
  const [toToken, setToToken] = useState(tokens[1].symbol);
  const [amount, setAmount] = useState('1');
  const [quotes, setQuotes] = useState<any[]>([]);
  const [selectedQuote, setSelectedQuote] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [popup, setPopup] = useState<{ show: boolean; title: string; message: string; details?: Record<string, any> }>({ show: false, title: '', message: '' });
  const [showBtcPopup, setShowBtcPopup] = useState(false);
  const [btcAddress, setBtcAddress] = useState('');
  const [btcCheckbox, setBtcCheckbox] = useState(false);
  const [midnightWallet, setMidnightWallet] = useState<any>(null);
  const [midnightAddress, setMidnightAddress] = useState('');
  const [showActionsPopup, setShowActionsPopup] = useState(false);
  const [showM20Popup, setShowM20Popup] = useState(false);
  const [m20Recipient, setM20Recipient] = useState('');

  const formatPopupValue = (value: any) => {
    if (typeof value === 'bigint') {
      return value.toString();
    }
    if (typeof value === 'object' && value !== null) {
      return JSON.stringify(value);
    }
    return String(value);
  };

  useEffect(() => {
    setQuotes([]);
    setSelectedQuote(null);
  }, [fromToken, toToken, amount]);

  const handleGetQuotes = async () => {
    setLoading(true);
    setQuotes([]);
    setSelectedQuote(null);
    try {
      const orderId = `order-${Date.now()}`;
      const response = await fetch('http://localhost:9999/api/get-quotes', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          orderId: orderId,
          fromToken: fromToken.toLowerCase(),
          toToken: toToken.toLowerCase(),
          fromAmount: parseFloat(amount),
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      const formattedQuotes = data.map((quote: any) => ({
        id: quote.filler,
        provider: quote.filler,
        toAmount: quote.toAmount,
        fee: quote.fee,
        orderId: orderId,
      }));
      
      const sortedQuotes = [...formattedQuotes].sort((a, b) => b.toAmount - a.toAmount);
      
      for (let i = 0; i < sortedQuotes.length; i++) {
        const quote = sortedQuotes[i];
        const delay = Math.random() * (300 - 10) + 10;
        await new Promise(resolve => setTimeout(resolve, delay));
        
        setQuotes(prevQuotes => [...prevQuotes, quote]);

        if (i === 0) {
          setSelectedQuote(quote);
        }
      }
    } catch (error) {
      console.error("Failed to get quotes:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleMidnightLogin = async () => {
    setLoading(true);
    try {
      const data = await paima.loginMidnight();
      setMidnightWallet(data);
      setMidnightAddress(data.addr);
    } catch (error) {
      console.error("Failed to connect Midnight wallet:", error);
    } finally {
      setLoading(false);
    }
  };

  const getDustFromFaucet = async () => {
    if (!midnightAddress) {
      alert('Please connect Midnight wallet first.');
      return;
    }
    setLoading(true);
    try {
      const response = await fetch(`http://localhost:9999/api/faucet?address=${midnightAddress}`);
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Faucet request failed: ${response.status} ${response.statusText} - ${errorText}`);
      }
      setPopup({
        show: true,
        title: 'Faucet Success!',
        message: 'Successfully received DUST from faucet! Your balance will update shortly.',
      });
    } catch (error) {
      console.error('Failed to get DUST from faucet:', error);
      alert(`Failed to get DUST from faucet. Check the console for details.`);
    } finally {
      setLoading(false);
    }
  };

  const handleMintM20 = async () => {
    if (!midnightAddress) {
      alert('Please connect Midnight wallet first.');
      return;
    }
    setLoading(true);
    try {
      await paima.m20_mint(midnightWallet.contract.unshielded_erc20, midnightWallet.addr, 1000n * 100000000n);
      setPopup({
        show: true,
        title: 'M20 Mint Successful!',
        message: 'Successfully minted 1000 M20 tokens. Your balance will update shortly.',
      });
    } catch (error) {
      console.error('Failed to mint M20:', error);
      alert(`Failed to mint M20. Check the console for details.`);
    } finally {
      setLoading(false);
    }
  };

  const handleSwapNow = async () => {
    if (fromToken === 'BTC') {
      setShowBtcPopup(true);
    } else if (fromToken === 'M20') {
      if (toToken !== 'BTC') {
        setM20Recipient(midnightWallet.addr);
      } else {
        setM20Recipient('');
      }
      setShowM20Popup(true);
    } else {
      // setLoading(true);
      // // This is the part that needs to be connected to createIntent for other tokens
      // // For now, it shows a popup as a placeholder
      // console.log('Swap now for non-BTC token');
      // const intent = await paima.createIntent(midnightWallet.contract.erc7683, midnightWallet.addr, {});
      // setTimeout(() => {
      //   setLoading(false);
      //   setPopup({
      //     show: true,
      //     title: 'Swap Successful!',
      //     message: 'Your transaction has been completed.',
      //   });
      // }, 2000); // Simulate a 2-second swap process
    }
  };

  const handleTokenSwap = () => {
    setFromToken(toToken);
    setToToken(fromToken);
  };

  const handleM20SwapContinue = async () => {
    setShowM20Popup(false);
    setLoading(true);
    try {
      const destinationChainId = toToken === 'BTC' ? 1n : toToken === 'ETH' ? 2n : 9999n;
      const recipientAddress = m20Recipient;
      const intentConfig = {
        user: midnightWallet.addr,
        orderId: selectedQuote.orderId,
        originChainId: 9999n,
        destinationChainId: destinationChainId,
        maxSpent_token: "m20",
        maxSpent_amount: BigInt(Math.round(parseFloat(amount) * Math.pow(10, 8))),
        maxSpent_recipient: midnightWallet.contractAddress.erc7683,
        maxSpent_chainId: 9999n,
        minReceived_token: toToken.toLowerCase(),
        minReceived_amount: BigInt(Math.round(selectedQuote.toAmount * Math.pow(10, 8))),
        minReceived_recipient: recipientAddress,
        minReceived_chainId: destinationChainId,
        originData: {
          targetWallet: midnightWallet.addr,
        },
      };
      const intentResult = await paima.createIntent(midnightWallet.contract.erc7683, midnightWallet.addr, intentConfig);

      const m20Amount = BigInt(parseFloat(amount) * Math.pow(10, 8));
      const transferResult = await paima.m20_transferFrom(
        midnightWallet.contract.unshielded_erc20,
        midnightWallet.addr,
        "mn_shield-addr_undeployed1mjngjmnlutcq50trhcsk3hugvt9wyjnhq3c7prryd5nqmvtzva0sxqpvzkdy4k9u7eyffff53cge62tqylevq3wqps86tdjuahsquwvucsy9kffv",
        m20Amount
      );
      setPopup({
        show: true,
        title: 'Swap Successful!',
        message: `Your ${fromToken} to ${toToken} swap has been created.`,
        details: {
          'Intent Tx ID': intentResult.txId,
          'Intent Block': intentResult.blockHeight,
          'Transfer Tx ID': transferResult.txId,
          'Transfer Block': transferResult.blockHeight,
          ...intentConfig,
        }
      });
    } catch (error) {
      console.error('Failed to swap M20:', error);
      setPopup({
        show: true,
        title: 'Error',
        message: 'Failed to swap M20. See console for details.',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleBtcSwapContinue = async () => {
    setShowBtcPopup(false);
    setLoading(true);

    try {
      const intentConfig = {
        user: midnightWallet.addr,
        orderId: selectedQuote.orderId,
        originChainId: 1n,
        destinationChainId: 9999n,

        maxSpent_token: "btc",
        // convert BTC to satoshis
        maxSpent_amount: BigInt(Math.round(parseFloat(amount) * 100000000)),
        maxSpent_recipient: btcAddress,
        maxSpent_chainId: 1n,

        minReceived_token: "m20",
        // Convert M20 to base units
        minReceived_amount: BigInt(Math.round(selectedQuote.toAmount * Math.pow(10, 8))),
        minReceived_recipient: midnightWallet.addr,
        minReceived_chainId: 9999n,

        originData: {
          targetWallet: btcAddress,
        },
      };
      const intentResult = await paima.createIntent(midnightWallet.contract.erc7683, midnightWallet.addr, intentConfig);

      setPopup({
        show: true,
        title: 'Intent Created!',
        message: `Your ${fromToken} to ${toToken} swap has been created.`,
        details: {
          'Intent Tx ID': intentResult.txId,
          'Intent Block': intentResult.blockHeight,
          ...intentConfig,
        }
      });
    } catch (error) {
      console.error('Failed to create intent:', error);
      setPopup({
        show: true,
        title: 'Error',
        message: 'Failed to create swap intent. See console for details.',
      });
    } finally {
      setLoading(false);
    }
  };

  const closePopup = () => {
    setPopup({ show: false, title: '', message: '' });
    setQuotes([]);
    setSelectedQuote(null);
  };

  return (
    <>
      <header className="app-header">
        <div className="header-container">
          <div className="wallet-buttons">
            {midnightAddress ? (
              <>
                <button type="button" className="wallet-button" disabled>
                  {`Midnight: ${midnightAddress.substring(0, 12)}...${midnightAddress.substring(midnightAddress.length - 8)}`}
                </button>
                <button type="button" className="wallet-button" onClick={() => setShowActionsPopup(true)}>
                  &#x22EE;
                </button>
              </>
            ) : (
                <button type="button" className="wallet-button" onClick={handleMidnightLogin}>Connect Midnight Wallet</button>
            )}
            <button type="button" className="wallet-button">Connect Bitcoin Wallet</button>
          </div>
        </div>
      </header>
      <div className="app-container">
        <main className="app-body">
          <h1 className="main-title">Night-Bitcoin Swap</h1>
          <div className="swap-container">
            <div className="swap-label">I want to swap</div>
            <div className="swap-input-line">
              <input
                type="number"
                inputMode="numeric" 
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="amount-input"
                style={{ width: `${1+Math.max(3, amount.length)}ch` }}
                placeholder="0"
              />
              <select
                value={fromToken}
                onChange={(e) => setFromToken(e.target.value)}
                className="token-select"
              >
                {tokens.map((token) => (
                  <option key={token.id} value={token.symbol}>
                    {token.name} ({token.symbol})
                  </option>
                ))}
              </select>
            </div>
            <div style={{ display: 'flex', justifyContent: 'center', padding: '8px 0' }}>
              <button
                type="button"
                onClick={handleTokenSwap}
                style={{
                  background: '#2a2a2a',
                  border: '1px solid #444',
                  borderRadius: '50%',
                  width: '36px',
                  height: '36px',
                  cursor: 'pointer',
                  color: '#fff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '18px'
                }}
              >
                &#x2195;
              </button>
            </div>
            <div className="swap-label">receive</div>
            <div className="swap-input-line">
              <select
                value={toToken}
                onChange={(e) => setToToken(e.target.value)}
                className="token-select"
              >
                {tokens.map((token) => (
                  <option key={token.id} value={token.symbol}>
                    {token.name} ({token.symbol})
                  </option>
                ))}
              </select>
            </div>
            <div className="swap-now-container">
            <button type="button" className="get-quotes-button" onClick={handleGetQuotes}>
              Get Quotes
            </button>
            </div>
          </div>

          {quotes.length > 0 && (
            <div className="quotes-list">
              <h3>Available Quotes</h3>
              {quotes.map((quote, index) => (
                <div
                  key={quote.id}
                  className={`quote-item ${
                    selectedQuote?.id === quote.id ? "selected" : ""
                  }`}
                  onClick={() => setSelectedQuote(quote)}
                >
                  <div className="quote-provider">
                    {quote.provider}
                    {index === 0 && <span className="best-deal-label">[BEST DEAL]</span>}
                  </div>
                  <div className="quote-amount">
                    You get: {formatNumber(quote.toAmount)} {toToken}
                  </div>
                  <div className="quote-fee">Fee: {formatNumber(quote.fee)} {toToken}</div>
                </div>
              ))}
            </div>
          )}

          {selectedQuote && (
            <div className="swap-now-container">
              <button type="button" className="swap-now-button" onClick={handleSwapNow} disabled={!midnightAddress}>
                Swap Now
              </button>
            </div>
          )}
        </main>

        {loading && (
          <div className="loader-overlay">
            <div className="spinner"></div>
            <p>Processing transaction...</p>
          </div>
        )}

        {popup.show && (
          <div className="popup-overlay">
            <div className="popup">
              <h3>{popup.title}</h3>
              <p>{popup.message}</p>
              {popup.details && (
                <table className="popup-details-table">
                  <tbody>
                    {Object.entries(popup.details).map(([key, value]) => (
                      <tr key={key}>
                        <td>{key}</td>
                        <td>{formatPopupValue(value)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              <button type="button" onClick={closePopup}>Close</button>
            </div>
          </div>
        )}

        {showActionsPopup && (
          <div className="popup-overlay">
            <div className="popup">
              <h3>Actions</h3>
              <div className="popup-buttons" style={{ display: 'flex', flexDirection: 'column' }}>
                <button
                  type="button"
                  className="dropdown-item"
                  onClick={() => { getDustFromFaucet(); setShowActionsPopup(false); }}
                  style={{ marginBottom: '10px' }}
                >
                  Get DUST from Faucet
                </button>
                <button
                  type="button"
                  className="dropdown-item"
                  onClick={() => { handleMintM20(); setShowActionsPopup(false); }}
                  style={{ marginBottom: '10px' }}
                >
                  Mint M20 Tokens
                </button>
                <button
                  type="button"
                  onClick={() => setShowActionsPopup(false)}
                  style={{ backgroundColor: 'grey' }}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {showBtcPopup && (
          <div className="popup-overlay">
            <div className="popup btc-popup">
              <h3>To complete the swap you need to</h3>
              <div className="btc-steps">
                <div className="step">
                  {/* <div className="step-number">1</div> */}
                  <div className="step-content">
                    <label>Tell us your BTC Address</label>
                    <input
                      type="text"
                      style={{ width: '100%' }}
                      value={btcAddress}
                      onChange={(e) => setBtcAddress(e.target.value)}
                      placeholder="Enter your BTC address"
                    />
                  </div>
                </div>
                <div className="step">
                  <div className="step-content">
                    <br></br>
                  </div>
                </div>
                <div className="step" style={{ marginTop: '20px' }}>
                  {/* <div className="step-number">2</div> */}
                  <div className="step-content">
                    <label>
                      <input
                        type="checkbox"
                        checked={btcCheckbox}
                        onChange={(e) => setBtcCheckbox(e.target.checked)}
                      />
                      From this address send <b>{amount} {fromToken}</b> to 1At16qkNSZm2BVpUZGNvdufbCe9cKma8o3
                    </label>
                  </div>
                </div>
              </div>
              <div className="popup-buttons" style={{ marginTop: '20px' }}>
                <button
                  type="button"
                  onClick={handleBtcSwapContinue}
                  disabled={!btcAddress || !btcCheckbox}
                  style={{ marginRight: '10px' }}
                >
                  Continue
                </button>
                <button type="button" onClick={() => setShowBtcPopup(false)} style={{ marginLeft: '10px', backgroundColor: 'grey' }}>
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {showM20Popup && (
          <div className="popup-overlay">
            <div className="popup">
              <h3>Enter recipient address</h3>
              <div className="step-content">
                <label>Address to send {toToken} to</label>
                <input
                  type="text"
                  style={{ width: '100%' }}
                  value={m20Recipient}
                  onChange={(e) => setM20Recipient(e.target.value)}
                  placeholder={`Enter recipient ${toToken} address`}
                />
              </div>
              <div className="popup-buttons" style={{ marginTop: '20px' }}>
                <button
                  type="button"
                  onClick={handleM20SwapContinue}
                  disabled={!m20Recipient}
                  style={{ marginRight: '10px' }}
                >
                  Continue
                </button>
                <button type="button" onClick={() => setShowM20Popup(false)} style={{ marginLeft: '10px', backgroundColor: 'grey' }}>
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

export default App;
