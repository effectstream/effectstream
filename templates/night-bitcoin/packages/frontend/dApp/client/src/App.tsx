import { useState, useEffect } from "react";
import "./App.css";
import * as paima from './paima.ts';

// Mock data for tokens and quotes
const tokens = [
  { id: 'btc', name: 'Bitcoin', symbol: 'BTC' },
  { id: 'eth', name: 'Ethereum', symbol: 'ETH' },
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
  const [popup, setPopup] = useState({ show: false, title: '', message: '' });
  const [midnightWallet, setMidnightWallet] = useState<any>(null);
  const [midnightAddress, setMidnightAddress] = useState('');

  useEffect(() => {
    setQuotes([]);
    setSelectedQuote(null);
  }, [fromToken, toToken, amount]);

  const handleGetQuotes = async () => {
    setLoading(true);
    setQuotes([]);
    setSelectedQuote(null);
    try {
      const response = await fetch('http://localhost:9999/api/get-quotes', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          orderId: `order-${Date.now()}`,
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
      }));
      
      const sortedQuotes = [...formattedQuotes].sort((a, b) => b.toAmount - a.toAmount);
      setQuotes(sortedQuotes);
      if (sortedQuotes.length > 0) {
        setSelectedQuote(sortedQuotes[0]);
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

      paima.createIntent(data.contract.erc7683, data.addr, BigInt(amount));

      setMidnightWallet(data.wallet);
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

  const handleSwapNow = () => {
    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      setPopup({
        show: true,
        title: 'Swap Successful!',
        message: 'Your transaction has been completed.',
      });
    }, 2000); // Simulate a 2-second swap process
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
                <button type="button" className="wallet-button" onClick={getDustFromFaucet}>
                  Get DUST from Faucet
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
              {quotes.map((quote) => (
                <div
                  key={quote.id}
                  className={`quote-item ${
                    selectedQuote?.id === quote.id ? "selected" : ""
                  }`}
                  onClick={() => setSelectedQuote(quote)}
                >
                  <div className="quote-provider">{quote.provider}</div>
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
              <button type="button" className="swap-now-button" onClick={handleSwapNow}>
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
              <button type="button" onClick={closePopup}>Close</button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

export default App;
