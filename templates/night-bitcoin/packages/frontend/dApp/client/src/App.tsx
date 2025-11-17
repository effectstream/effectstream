import { useState } from "react";
import "./App.css";

// Mock data for tokens and quotes
const tokens = [
  { id: 'btc', name: 'Bitcoin', symbol: 'BTC' },
  { id: 'eth', name: 'Ethereum', symbol: 'ETH' },
  { id: 'm20', name: 'Midnight Token', symbol: 'M20' },
];

const mockQuotes = [
  { id: 1, provider: 'SwapLuxe', toAmount: 19.8, fee: '0.1 ETH' },
  { id: 2, provider: 'QuickBridge', toAmount: 20.1, fee: '0.05 ETH' },
  { id: 3, provider: 'MidnightSwap', toAmount: 19.9, fee: '0.08 ETH' },
];

function App() {
  const [fromToken, setFromToken] = useState(tokens[0].symbol);
  const [toToken, setToToken] = useState(tokens[1].symbol);
  const [amount, setAmount] = useState('1');
  const [quotes, setQuotes] = useState<any[]>([]);
  const [selectedQuote, setSelectedQuote] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [showPopup, setShowPopup] = useState(false);

  const handleGetQuotes = () => {
    // Sort quotes by most tokens received
    const sortedQuotes = [...mockQuotes].sort((a, b) => b.toAmount - a.toAmount);
    setQuotes(sortedQuotes);
    setSelectedQuote(null); // Reset selection when getting new quotes
  };

  const handleSwapNow = () => {
    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      setShowPopup(true);
    }, 2000); // Simulate a 2-second swap process
  };

  const closePopup = () => {
    setShowPopup(false);
    setQuotes([]);
    setSelectedQuote(null);
  };

  return (
    <>
      <header className="app-header">
        <div className="header-container">
          <div className="wallet-buttons">
            <button className="wallet-button">Connect Midnight Wallet</button>
            <button className="wallet-button">Connect Bitcoin Wallet</button>
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
            <div class="swap-now-container">
            <button className="get-quotes-button" onClick={handleGetQuotes}>
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
                    You get: {quote.toAmount} {toToken}
                  </div>
                  <div className="quote-fee">Fee: {quote.fee}</div>
                </div>
              ))}
            </div>
          )}

          {selectedQuote && (
            <div className="swap-now-container">
              <button className="swap-now-button" onClick={handleSwapNow}>
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

        {showPopup && (
          <div className="popup-overlay">
            <div className="popup">
              <h3>Swap Successful!</h3>
              <p>Your transaction has been completed.</p>
              <button onClick={closePopup}>Close</button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

export default App;
