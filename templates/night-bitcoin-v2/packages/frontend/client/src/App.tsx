import React, { useState, useEffect } from "react";
import "./App.css";
import * as apiInterface from "./interface.ts";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:9999";

// Mock data for tokens and quotes
const tokens = [
  { id: "btc", name: "Bitcoin", symbol: "BTC" },
  // { id: 'eth', name: 'Ethereum', symbol: 'ETH' },
  { id: "m20", name: "Midnight Token", symbol: "M20" },
];

const SATS_PER_BTC = 100_000_000n;
const BTC_DUST_LIMIT_SATS = 546n;

type SwapAllowance =
  | { allowed: true; reason?: undefined }
  | { allowed: false; reason: string };

const toSatoshis = (amount: string | number): bigint | null => {
  if (amount === null || amount === undefined) return null;

  const parsed =
    typeof amount === "number"
      ? amount
      : (() => {
          const trimmed = amount.trim();
          if (!trimmed) return NaN;
          return Number(trimmed);
        })();

  if (!Number.isFinite(parsed)) return null;

  const sats = Math.round(parsed * Number(SATS_PER_BTC));
  if (!Number.isFinite(sats)) return null;

  try {
    return BigInt(sats);
  } catch {
    return null;
  }
};

const isSwapAllowed = ({
  fromToken,
  toToken,
  amount,
  selectedQuote,
}: {
  fromToken: string;
  toToken: string;
  amount: string;
  selectedQuote: { toAmount: number } | null;
}): SwapAllowance => {
  if (fromToken === "BTC") {
    const sats = toSatoshis(amount);
    if (sats === null) {
      return {
        allowed: false,
        reason: "Enter a valid BTC amount before swapping.",
      };
    }

    if (sats <= BTC_DUST_LIMIT_SATS) {
      return {
        allowed: false,
        reason: `Swaps of ${Number(BTC_DUST_LIMIT_SATS)} sats or less fail due to the Bitcoin dust limit.`,
      };
    }

    return { allowed: true };
  }

  if (fromToken === "M20" && toToken === "BTC" && selectedQuote) {
    const sats = toSatoshis(selectedQuote.toAmount);
    if (sats === null) {
      return {
        allowed: false,
        reason: "Select a valid quote before swapping M20 to BTC.",
      };
    }

    if (sats <= BTC_DUST_LIMIT_SATS) {
      return {
        allowed: false,
        reason: `This quote would output ${
          selectedQuote.toAmount
        } BTC (${Number(BTC_DUST_LIMIT_SATS)} sats or less), which is below the Bitcoin dust limit.`,
      };
    }
  }

  return { allowed: true };
};

const formatNumber = (n: number | string): string => {
  const num = typeof n === "string" ? parseFloat(n) : n;
  if (isNaN(num)) return String(n);

  if (num >= 1) {
    return num.toLocaleString("en-US", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 3,
      useGrouping: false,
    });
  }

  if (num === 0) return "0";

  // toFixed(20) to get a string representation for small numbers without scientific notation
  const fullDecimalString = num.toFixed(20).split(".")[1];
  if (!fullDecimalString) return num.toString();

  let firstNonZeroIndex = -1;
  for (let i = 0; i < fullDecimalString.length; i++) {
    if (fullDecimalString[i] !== "0") {
      firstNonZeroIndex = i;
      break;
    }
  }

  if (firstNonZeroIndex === -1) {
    return "0";
  }

  const decimalPlacesToKeep = firstNonZeroIndex + 4;
  return num.toFixed(decimalPlacesToKeep);
};

function App() {
  const [fromToken, setFromToken] = useState(tokens[0].symbol);
  const [toToken, setToToken] = useState(tokens[1].symbol);
  const [amount, setAmount] = useState("1");
  const [quotes, setQuotes] = useState<any[]>([]);
  const [selectedQuote, setSelectedQuote] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [popup, setPopup] = useState<{
    show: boolean;
    title: string;
    message: React.ReactNode;
    details?: Record<string, any>;
  }>({ show: false, title: "", message: "" });
  const [showBtcPopup, setShowBtcPopup] = useState(false);
  const [btcAddress, setBtcAddress] = useState("");
  const [btcCheckbox, setBtcCheckbox] = useState(false);
  const [midnightWallet, setMidnightWallet] = useState<any>(null);
  const [midnightAddress, setMidnightAddress] = useState("");
  const [unshieldedAddress, setUnshieldedAddress] = useState("");
  const [m20Balance, setM20Balance] = useState<string>("");
  const [showActionsPopup, setShowActionsPopup] = useState(false);
  const [showM20Popup, setShowM20Popup] = useState(false);
  const [m20Recipient, setM20Recipient] = useState("");
  const [btcFaucetAddress, setBtcFaucetAddress] = useState("");
  const [orderIdSearch, setOrderIdSearch] = useState("");
  const [showBtcConnectPopup, setShowBtcConnectPopup] = useState(false);
  const [systemState, setSystemState] = useState("LOADING");

  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout>;
    let isMounted = true;

    const checkSystemState = async () => {
      try {
        const response = await fetch(`${API_URL}/api/check-processes`);
        if (isMounted && response.ok) {
          const state = await response.text();
          setSystemState(state);
          if (state === "READY") {
            return; // Stop polling when ready
          }
        }
      } catch (error) {
        if (isMounted) {
          console.error("Failed to check system state:", error);
        }
      }

      if (isMounted) {
        timeoutId = setTimeout(checkSystemState, 5000);
      }
    };

    // Check immediately
    checkSystemState();

    return () => {
      isMounted = false;
      clearTimeout(timeoutId);
    };
  }, []);

  const formatPopupValue = (value: any) => {
    if (typeof value === "bigint") {
      return value.toString();
    }
    if (typeof value === "object" && value !== null) {
      return JSON.stringify(value);
    }
    return String(value);
  };

  useEffect(() => {
    setQuotes([]);
    setSelectedQuote(null);
  }, [fromToken, toToken, amount]);

  const swapAllowance = isSwapAllowed({
    fromToken,
    toToken,
    amount,
    selectedQuote,
  });

  const updateM20Balance = async (wallet: any) => {
    if (!wallet) return;
    try {
      const balance = await apiInterface.midnight_balanceOf(
        wallet.connectedApi,
        wallet.contractAddress.unshielded_erc20,
      );
      if (balance !== undefined && balance !== null) {
        // M20 has 8 decimal places
        const formattedBalance = Number(balance) / 10 ** 8;
        const displayBalance = formatNumber(formattedBalance);
        setM20Balance(displayBalance);
        return displayBalance;
      } else {
        setM20Balance("0");
        return "0";
      }
    } catch (error) {
      console.error("Failed to fetch M20 balance:", error);
      setM20Balance("Error");
      return "Error";
    }
  };

  const handleCheckBalance = async () => {
    setShowActionsPopup(false);
    if (!midnightWallet) {
      setPopup({
        show: true,
        title: "Wallet Not Connected",
        message: "Connect the Midnight wallet first.",
      });
      return;
    }
    setLoading(true);
    try {
      const balance = await updateM20Balance(midnightWallet);
      setPopup({
        show: true,
        title: "M20 Balance",
        message: `Your M20 token balance is: ${balance}`,
      });
    } catch (error: any) {
      console.error("handleCheckBalance failed:", error);
      setPopup({
        show: true,
        title: "Error",
        message: error?.message || "Failed to check M20 balance.",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSearchIntent = async () => {
    if (!orderIdSearch) {
      setPopup({
        show: true,
        title: "Error",
        message: "Please enter an Order ID.",
      });
      return;
    }
    setLoading(true);
    try {
      const response = await fetch(
        `${API_URL}/api/intents?orderId=${orderIdSearch}`,
      );
      if (!response.ok) {
        const errorData = await response
          .json()
          .catch(() => ({ message: `HTTP error! status: ${response.status}` }));
        throw new Error(
          errorData.message || `HTTP error! status: ${response.status}`,
        );
      }
      const data = await response.json();
      setPopup({
        show: true,
        title: `Intent Details for ${orderIdSearch}`,
        message: "",
        details: data,
      });
    } catch (error: any) {
      console.error("Failed to fetch intent:", error);
      setPopup({
        show: true,
        title: "Error",
        message:
          error.message ||
          "Failed to fetch intent. See console for details.",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleGetBtcFromFaucet = async () => {
    setShowActionsPopup(false);
    if (!btcFaucetAddress) {
      setPopup({
        show: true,
        title: "Missing BTC Address",
        message: "Enter a BTC address before requesting from the faucet.",
      });
      return;
    }
    setLoading(true);
    try {
      const response = await fetch(
        `${API_URL}/api/faucet/btc?address=${encodeURIComponent(btcFaucetAddress)}`,
      );
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `BTC Faucet request failed: ${response.status} ${response.statusText} - ${errorText}`,
        );
      }
      setPopup({
        show: true,
        title: "Faucet Success!",
        message:
          "Successfully received BTC from faucet! Your balance will update shortly.",
      });
    } catch (error: any) {
      console.error("Failed to get BTC from faucet:", error);
      setPopup({
        show: true,
        title: "Faucet Failed",
        message: error?.message || "Failed to get BTC from faucet.",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleGetQuotes = async () => {
    setLoading(true);
    setQuotes([]);
    setSelectedQuote(null);
    try {
      const orderId = `order-${Date.now()}`;
      const response = await fetch(`${API_URL}/api/get-quotes`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          orderId: orderId,
          fromToken: fromToken.toLowerCase(),
          toToken: toToken.toLowerCase(),
          fromAmount: parseFloat(amount),
        }),
      });

      if (!response.ok) {
        let errorMessage = `Failed to get quotes (status ${response.status}).`;
        try {
          const errorData = await response.json();
          if (errorData?.message) {
            errorMessage = errorData.message;
          }
        } catch (_) {
          // ignore JSON parsing errors
        }
        throw new Error(errorMessage);
      }

      const data = await response.json();
      const formattedQuotes = data.map((quote: any) => ({
        id: quote.filler,
        provider: quote.filler,
        toAmount: quote.toAmount,
        fee: quote.fee,
        orderId: orderId,
      }));

      const sortedQuotes = [...formattedQuotes].sort(
        (a, b) => b.toAmount - a.toAmount,
      );

      for (let i = 0; i < sortedQuotes.length; i++) {
        const quote = sortedQuotes[i];
        const delay = Math.random() * (300 - 10) + 10;
        await new Promise((resolve) => setTimeout(resolve, delay));

        setQuotes((prevQuotes) => [...prevQuotes, quote]);

        if (i === 0) {
          setSelectedQuote(quote);
        }
      }
    } catch (error: any) {
      console.error("Failed to get quotes:", error);
      setPopup({
        show: true,
        title: "Unable to Get Quotes",
        message:
          error?.message || "Failed to get quotes. See console for details.",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleMidnightLogin = async () => {
    setLoading(true);
    try {
      const data = await apiInterface.loginMidnight();
      console.log("Midnight login data:", data);
      setMidnightWallet(data);
      setMidnightAddress(data.addr);
      setUnshieldedAddress(data.unshieldedAddr);
      await updateM20Balance(data);
    } catch (error) {
      console.error("Failed to connect Midnight wallet:", error);
      setPopup({
        show: true,
        title: "Wallet Not Found",
        message: (
          <>
            No wallet was found, please install{" "}
            <a
              href="https://chromewebstore.google.com/detail/lace-midnight-preview/hgeekaiplokcnmakghbdfbgnlfheichg"
              target="_blank"
              rel="noopener noreferrer"
            >
              Lace wallet preview
            </a>
            .
          </>
        ),
      });
    } finally {
      setLoading(false);
    }
  };

  const handleMintM20 = async () => {
    setShowActionsPopup(false);
    if (!midnightAddress) {
      setPopup({
        show: true,
        title: "Wallet Not Connected",
        message: "Connect the Midnight wallet first.",
      });
      return;
    }
    setLoading(true);
    try {
      // Mint native unshielded M20 coins to the user's own unshielded address
      // (mn_addr_*). The coins land in their Lace wallet under the M20 color.
      await apiInterface.m20_mint(
        midnightWallet.contract.unshielded_erc20,
        midnightWallet.unshieldedAddr,
        1000n * 100000000n,
      );
      setTimeout(() => updateM20Balance(midnightWallet), 2000); // optimistic refresh
      setPopup({
        show: true,
        title: "M20 Mint Successful!",
        message:
          "Successfully minted 1000 M20 tokens. Your balance will update shortly.",
      });
    } catch (error: any) {
      console.error("Failed to mint M20:", error);
      setPopup({
        show: true,
        title: "M20 Mint Failed",
        message: error?.message || "Failed to mint M20 tokens.",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSwapNow = async () => {
    if (!midnightAddress) {
      setPopup({
        show: true,
        title: "Wallet Not Connected",
        message: "Connect the midnight wallet first",
      });
      return;
    }

    const allowance = isSwapAllowed({
      fromToken,
      toToken,
      amount,
      selectedQuote,
    });
    if (!allowance.allowed) {
      setPopup({
        show: true,
        title: "Swap Not Allowed",
        message: allowance.reason,
      });
      return;
    }

    if (fromToken === "BTC") {
      setShowBtcPopup(true);
    } else if (fromToken === "M20") {
      if (toToken !== "BTC") {
        setM20Recipient(midnightWallet.addr);
      } else {
        setM20Recipient("");
      }
      setShowM20Popup(true);
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
      const destinationChainId =
        toToken === "BTC" ? 1n : toToken === "ETH" ? 2n : 9999n;
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
        minReceived_amount: BigInt(
          Math.round(selectedQuote.toAmount * Math.pow(10, 8)),
        ),
        minReceived_recipient: recipientAddress,
        minReceived_chainId: destinationChainId,
        originData: {
          targetWallet: midnightWallet.addr,
        },
      };
      const intentResult = await apiInterface.createIntent(
        midnightWallet.contract.erc7683,
        midnightWallet.addr,
        intentConfig,
      );

      if (!intentResult) {
        setPopup({
          show: true,
          title: "Error",
          message: "Failed to submit the intent. See console for details.",
        });
        return;
      }

      // v2 escrow note: in v1 the next step was an in-contract `transferFrom`
      // to lock M20 with the filler. With the new native-unshielded M20, that
      // contract method no longer exists — the user must move M20 to the
      // filler's unshielded (`mn_addr_…`) address using Lace's send UI. For
      // demo purposes we just submit the intent and let the filler observe
      // the M20 arrival via the sync node. TODO: surface the filler's
      // unshielded address in the quote so the user can copy/send via Lace.
      setTimeout(() => updateM20Balance(midnightWallet), 2000);
      setPopup({
        show: true,
        title: "Intent submitted",
        message:
          `Your ${fromToken} → ${toToken} intent is in the batcher. ` +
          "To complete the swap, send the M20 from your Lace wallet to the " +
          "filler's unshielded address (mn_addr_*) using Lace's native " +
          "unshielded-send. The filler will observe the M20 arrival and " +
          "release the BTC.",
        details: {
          "Intent Tx ID": intentResult.txId,
          "Intent Block": intentResult.blockHeight,
          ...intentConfig,
        },
      });
    } catch (error) {
      console.error("Failed to swap M20:", error);
      setPopup({
        show: true,
        title: "Error",
        message: "Failed to swap M20. See console for details.",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleBtcSwapContinue = async () => {
    setShowBtcPopup(false);
    const allowance = isSwapAllowed({
      fromToken,
      toToken,
      amount,
      selectedQuote,
    });
    if (!allowance.allowed) {
      setPopup({
        show: true,
        title: "Swap Not Allowed",
        message: allowance.reason,
      });
      return;
    }
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
        minReceived_amount: BigInt(
          Math.round(selectedQuote.toAmount * Math.pow(10, 8)),
        ),
        minReceived_recipient: midnightWallet.addr,
        minReceived_chainId: 9999n,

        originData: {
          targetWallet: btcAddress,
        },
      };
      const intentResult = await apiInterface.createIntent(
        midnightWallet.contract.erc7683,
        midnightWallet.addr,
        intentConfig,
      );

      if (!intentResult) {
        setPopup({
          show: true,
          title: "Error",
          message: "Failed to create swap intent. See console for details.",
        });
        return;
      }

      setPopup({
        show: true,
        title: "Intent Created!",
        message: `Your ${fromToken} to ${toToken} swap has been created.`,
        details: {
          "Intent Tx ID": intentResult.txId,
          "Intent Block": intentResult.blockHeight,
          ...intentConfig,
        },
      });
    } catch (error) {
      console.error("Failed to create intent:", error);
      setPopup({
        show: true,
        title: "Error",
        message: "Failed to create swap intent. See console for details.",
      });
    } finally {
      setLoading(false);
    }
  };

  const closePopup = () => {
    setPopup({ show: false, title: "", message: "" });
    setQuotes([]);
    setSelectedQuote(null);
  };

  return (
    <>
      {systemState !== "READY" && (
        <div
          className="system-banner"
          style={{
            backgroundColor: "#ff9800",
            color: "#fff",
            textAlign: "center",
            padding: "10px",
            fontWeight: "bold",
            position: "fixed",
            top: 0,
            left: 0,
            width: "100%",
            zIndex: 1000,
          }}
        >
          The Fillers/Solvers wallets are being created and filled... please
          wait
        </div>
      )}
      <header
        className="app-header"
        style={{ marginTop: systemState !== "READY" ? "40px" : "0" }}
      >
        <div
          className="header-container"
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            width: "100%",
          }}
        >
          <div
            className="search-container"
            style={{ display: "flex", alignItems: "center" }}
          >
            <input
              type="text"
              value={orderIdSearch}
              onChange={(e) => setOrderIdSearch(e.target.value)}
              placeholder="Search by Order ID"
              style={{
                padding: "8px",
                marginRight: "8px",
                borderRadius: "4px",
                border: "1px solid #444",
                backgroundColor: "#2a2a2a",
                color: "#fff",
              }}
            />
            <button
              type="button"
              onClick={handleSearchIntent}
              className="wallet-button"
            >
              Search
            </button>
          </div>
          <div className="wallet-buttons">
            {midnightAddress ? (
              <>
                <button type="button" className="wallet-button" disabled>
                  {`Midnight: ${midnightAddress.substring(0, 12)}...${midnightAddress.substring(midnightAddress.length - 8)}`}
                </button>
                {m20Balance && (
                  <div className="wallet-button balance-display">{`M20: ${m20Balance}`}</div>
                )}
              </>
            ) : (
              <button
                type="button"
                className="wallet-button"
                onClick={handleMidnightLogin}
              >
                Connect Midnight Wallet
              </button>
            )}
            <button
              type="button"
              className="wallet-button"
              onClick={() => setShowBtcConnectPopup(true)}
            >
              Connect Bitcoin Wallet
            </button>
            <button
              type="button"
              className="wallet-button"
              onClick={() => setShowActionsPopup(true)}
            >
              &#x22EE;
            </button>
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
                style={{ width: `${1 + Math.max(3, amount.length)}ch` }}
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
            <div
              style={{
                display: "flex",
                justifyContent: "center",
                padding: "8px 0",
              }}
            >
              <button
                type="button"
                onClick={handleTokenSwap}
                style={{
                  background: "#2a2a2a",
                  border: "1px solid #444",
                  borderRadius: "50%",
                  width: "36px",
                  height: "36px",
                  cursor: "pointer",
                  color: "#fff",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "18px",
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
              <button
                type="button"
                className="get-quotes-button"
                onClick={handleGetQuotes}
              >
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
                    {index === 0 && (
                      <span className="best-deal-label">[BEST DEAL]</span>
                    )}
                  </div>
                  <div className="quote-amount">
                    You get: {formatNumber(quote.toAmount)} {toToken}
                  </div>
                  <div className="quote-fee">
                    Fee: {formatNumber(quote.fee)} {toToken}
                  </div>
                </div>
              ))}
            </div>
          )}

          {selectedQuote && (
            <div className="swap-now-container">
              <button
                type="button"
                className="swap-now-button"
                onClick={handleSwapNow}
                disabled={!swapAllowance.allowed}
                title={!swapAllowance.allowed ? swapAllowance.reason : undefined}
              >
                Swap Now
              </button>
              {!swapAllowance.allowed && (
                <div
                  style={{
                    marginTop: "8px",
                    color: "#ff8a80",
                    textAlign: "center",
                  }}
                >
                  {swapAllowance.reason}
                </div>
              )}
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
              <button type="button" onClick={closePopup}>
                Close
              </button>
            </div>
          </div>
        )}

        {showActionsPopup && (
          <div className="popup-overlay">
            <div className="popup">
              <h3>Actions</h3>
              <div
                className="popup-buttons"
                style={{ display: "flex", flexDirection: "column" }}
              >
                <button
                  type="button"
                  className="dropdown-item"
                  onClick={handleMintM20}
                  style={{ marginBottom: "10px" }}
                  disabled={!midnightAddress}
                >
                  Mint M20 Tokens
                </button>
                <button
                  type="button"
                  className="dropdown-item"
                  onClick={handleCheckBalance}
                  style={{ marginBottom: "10px" }}
                  disabled={!midnightAddress}
                >
                  Check M20 Balance
                </button>
                <div
                  style={{ borderTop: "1px solid #444", margin: "10px 0" }}
                ></div>
                <div className="step-content">
                  <label>BTC Address for Faucet</label>
                  <input
                    type="text"
                    style={{ width: "100%", marginTop: "5px" }}
                    value={btcFaucetAddress}
                    onChange={(e) => setBtcFaucetAddress(e.target.value)}
                    placeholder="Enter your BTC address"
                  />
                </div>
                <button
                  type="button"
                  className="dropdown-item"
                  onClick={handleGetBtcFromFaucet}
                  disabled={!btcFaucetAddress}
                  style={{ marginTop: "10px" }}
                >
                  Get BTC from Faucet
                </button>
                <button
                  type="button"
                  onClick={() => setShowActionsPopup(false)}
                  style={{ backgroundColor: "grey", marginTop: "20px" }}
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
                  <div className="step-content">
                    <label>Tell us your BTC Address</label>
                    <input
                      type="text"
                      style={{ width: "100%" }}
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
                <div className="step" style={{ marginTop: "20px" }}>
                  <div className="step-content">
                    <label>
                      <input
                        type="checkbox"
                        checked={btcCheckbox}
                        onChange={(e) => setBtcCheckbox(e.target.checked)}
                      />
                      From this address send{" "}
                      <b>
                        {amount} {fromToken}
                      </b>{" "}
                      to bcrt1qfv6m6l5s6cgda09yr5nd8rnufkaz59d3aquq03
                    </label>
                  </div>
                </div>
              </div>
              <div className="popup-buttons" style={{ marginTop: "20px" }}>
                <button
                  type="button"
                  onClick={handleBtcSwapContinue}
                  disabled={!btcAddress || !btcCheckbox}
                  style={{ marginRight: "10px" }}
                >
                  Continue
                </button>
                <button
                  type="button"
                  onClick={() => setShowBtcPopup(false)}
                  style={{ marginLeft: "10px", backgroundColor: "grey" }}
                >
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
                  style={{ width: "100%" }}
                  value={m20Recipient}
                  onChange={(e) => setM20Recipient(e.target.value)}
                  placeholder={`Enter recipient ${toToken} address`}
                />
              </div>
              <div className="popup-buttons" style={{ marginTop: "20px" }}>
                <button
                  type="button"
                  onClick={handleM20SwapContinue}
                  disabled={!m20Recipient}
                  style={{ marginRight: "10px" }}
                >
                  Continue
                </button>
                <button
                  type="button"
                  onClick={() => setShowM20Popup(false)}
                  style={{ marginLeft: "10px", backgroundColor: "grey" }}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {showBtcConnectPopup && (
          <div className="popup-overlay">
            <div className="popup">
              <h3>Connect Bitcoin Wallet</h3>
              <div
                style={{
                  padding: "20px",
                  textAlign: "left",
                  lineHeight: "1.6",
                }}
              >
                Connect a bitcoin wallet, such as{" "}
                <a
                  href="https://sparrowwallet.com/"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Sparrow
                </a>
                , and configure it for{" "}
                <a
                  href="https://sparrowwallet.com/docs/faq.html#how-can-i-run-testnet"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  regtest mode
                </a>
                .
                <br />
                <br />
                Once connected, use the Faucet to get funds by pressing the
                three dots (&#x22EE;) in the header.
              </div>
              <button
                type="button"
                onClick={() => setShowBtcConnectPopup(false)}
              >
                Close
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

export default App;
