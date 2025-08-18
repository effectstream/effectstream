import { useEffect, useState } from "react";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { createWalletClient, http } from "viem";
import { hardhat } from "viem/chains";
import { ADDRESSES_ENDPOINT, BATCHER_ENDPOINT } from "../config.ts";
// import { createMessageForBatcher } from "@paimaexample/concise";

interface AddressRow {
  account_id: number | null;
  address: string;
  primary_address: string | null;
}

interface GroupedAddress {
  account_id: number | null;
  addresses: string[];
  hasPrimaryAddress: boolean;
  primaryAddress: string | null;
}

interface WalletInfo {
  id: string;
  privateKey: `0x${string}`;
  address: `0x${string}`;
  name: string;
}

interface Notification {
  id: number;
  type: "success" | "error" | "info";
  title: string;
  message: string;
}

const AddressType = {
  EVM: 0,
};

async function createSignedInput(gameInput: string, walletInfo: WalletInfo) {
  const account = privateKeyToAccount(walletInfo.privateKey);
  const walletClient = createWalletClient({
    account,
    chain: hardhat,
    transport: http(),
  });

  const timestamp = Date.now().toString();
  const userAddress = account.address;
  const addressType = AddressType.EVM;

  const createMessageForBatcher = (
    _: any,
    timestamp: string,
    userAddress: string,
    gameInput: string,
  ) => {
    return `${timestamp}:${userAddress}:${gameInput}`;
  };

  const message = createMessageForBatcher(
    null,
    timestamp,
    userAddress,
    gameInput,
  );

  const signature = await walletClient.signMessage({
    message,
  });

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

async function postToBatcher(jsonArrayString: string, walletInfo: WalletInfo) {
  console.log("🚀 Creating signed input for:", jsonArrayString);
  const signedInput = await createSignedInput(jsonArrayString, walletInfo);

  console.log("✅ Signed input created:", {
    ...signedInput,
    userSignature: signedInput.userSignature.slice(0, 10) + "...",
  });

  console.log("📤 Sending to batcher...");
  const result = await sendInputToBatcher(signedInput);

  console.log("🎉 Batcher response:", result);
  return result;
}

export function AddressesTable() {
  const [addresses, setAddresses] = useState<AddressRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [wallets, setWallets] = useState<WalletInfo[]>([]);
  const [selectedWallet, setSelectedWallet] = useState<WalletInfo | null>(null);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [isWalletSectionCollapsed, setIsWalletSectionCollapsed] = useState(
    false,
  );
  const [isCommandsSectionCollapsed, setIsCommandsSectionCollapsed] = useState(
    false,
  );
  const [commandLoading, setCommandLoading] = useState(false);
  const [selectedAction, setSelectedAction] = useState<string>("");
  const [linkAddress, setLinkAddress] = useState("");
  const [unlinkAddress, setUnlinkAddress] = useState("");
  const [selectedAccountId, setSelectedAccountId] = useState<number | null>(
    null,
  );
  const [selectedLinkWallet, setSelectedLinkWallet] = useState<
    WalletInfo | null
  >(null);

  const showNotification = (
    type: Notification["type"],
    title: string,
    message: string,
  ) => {
    const id = Date.now();
    const notification: Notification = { id, type, title, message };
    setNotifications((prev) => [...prev, notification]);

    // Auto-remove after 5 seconds
    setTimeout(() => {
      setNotifications((prev) => prev.filter((n) => n.id !== id));
    }, 5000);
  };

  const removeNotification = (id: number) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  };

  const generateNewWallet = () => {
    const privateKey = generatePrivateKey();
    const account = privateKeyToAccount(privateKey);
    const newWallet: WalletInfo = {
      id: Date.now().toString(),
      privateKey,
      address: account.address,
      name: `Wallet ${wallets.length + 1}`,
    };
    setWallets((prev) => [...prev, newWallet]);
    setSelectedWallet(newWallet);
    showNotification(
      "success",
      "Wallet Generated",
      `New wallet created: ${account.address.slice(0, 6)}...${
        account.address.slice(-4)
      }`,
    );
  };

  const removeWallet = (walletId: string) => {
    setWallets((prev) => prev.filter((w) => w.id !== walletId));
    if (selectedWallet?.id === walletId) {
      setSelectedWallet(null);
    }
  };

  const updateWalletName = (walletId: string, name: string) => {
    setWallets((prev) =>
      prev.map((w) => (w.id === walletId ? { ...w, name } : w))
    );
  };

  // Account commands
  const executeCreateAccount = async () => {
    if (!selectedWallet) {
      showNotification("error", "No Wallet", "Please select a wallet first");
      return;
    }

    setCommandLoading(true);
    try {
      const jsonArray = ["&createAccount"];
      const jsonArrayString = JSON.stringify(jsonArray);
      await postToBatcher(jsonArrayString, selectedWallet);
      showNotification(
        "success",
        "Account Created",
        "Successfully created account! Use the refresh button to see updated addresses.",
      );
    } catch (error) {
      showNotification(
        "error",
        "Create Account Error",
        `Error creating account: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
      );
    } finally {
      setCommandLoading(false);
    }
  };

  const executeUnlinkSelf = async () => {
    if (!selectedWallet) {
      showNotification("error", "No Wallet", "Please select a wallet first");
      return;
    }

    if (!selectedAccountId) {
      showNotification("error", "No Account", "Please select an account ID");
      return;
    }

    setCommandLoading(true);
    try {
      const jsonArray = [
        "&unlinkAddress",
        selectedAccountId.toString(),
        "",
        "",
        "",
      ];
      const jsonArrayString = JSON.stringify(jsonArray);
      await postToBatcher(jsonArrayString, selectedWallet);
      showNotification(
        "success",
        "Self Unlinked",
        "Successfully unlinked self from account! Use the refresh button to see updated addresses.",
      );
    } catch (error) {
      showNotification(
        "error",
        "Unlink Self Error",
        `Error unlinking self: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
      );
    } finally {
      setCommandLoading(false);
    }
  };

  const executeUnlinkOther = async () => {
    if (!selectedWallet) {
      showNotification("error", "No Wallet", "Please select a wallet first");
      return;
    }

    if (!selectedAccountId) {
      showNotification("error", "No Account", "Please select an account ID");
      return;
    }

    if (!unlinkAddress.trim()) {
      showNotification(
        "error",
        "No Address",
        "Please enter an address to unlink",
      );
      return;
    }

    const walletClient = createWalletClient({
      account: privateKeyToAccount(selectedWallet.privateKey),
      chain: hardhat,
      transport: http(),
    });

    setCommandLoading(true);
    const message = `unlink:${
      String(selectedAccountId)
    }:${unlinkAddress.toString().toLowerCase().trim()}:`;
    const signature = await walletClient.signMessage({
      message,
    });
    try {
      const jsonArray = [
        "&unlinkAddress",
        selectedAccountId.toString(),
        signature,
        unlinkAddress.toString().toLowerCase().trim(),
        "",
      ];
      const jsonArrayString = JSON.stringify(jsonArray);
      await postToBatcher(jsonArrayString, selectedWallet);
      showNotification(
        "success",
        "Address Unlinked",
        "Successfully unlinked address from account! Use the refresh button to see updated addresses.",
      );
      setUnlinkAddress("");
    } catch (error) {
      showNotification(
        "error",
        "Unlink Other Error",
        `Error unlinking address: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
      );
    } finally {
      setCommandLoading(false);
    }
  };

  const executeLinkAddress = async () => {
    if (!selectedWallet) {
      showNotification("error", "No Wallet", "Please select a wallet first");
      return;
    }

    if (!selectedAccountId) {
      showNotification("error", "No Account", "Please select an account ID");
      return;
    }

    if (!selectedLinkWallet) {
      showNotification(
        "error",
        "No Link Wallet",
        "Please select a wallet to link",
      );
      return;
    }

    setCommandLoading(true);
    try {
      // Create signatures for both wallets
      const walletClient = createWalletClient({
        account: privateKeyToAccount(selectedWallet.privateKey),
        chain: hardhat,
        transport: http(),
      });

      const linkWalletClient = createWalletClient({
        account: privateKeyToAccount(selectedLinkWallet.privateKey),
        chain: hardhat,
        transport: http(),
      });

      // Create the link message and signatures
      const linkMessage =
        `link:${selectedAccountId}:${selectedLinkWallet.address.toString().toLowerCase().trim()}:false`;
      const primarySignature = await walletClient.signMessage({
        message: linkMessage,
      });
      const newAddressMessage =
        `link:${selectedAccountId}:${selectedWallet.address.toString().toLowerCase().trim()}:false`;
      const newAddressSignature = await linkWalletClient.signMessage({
        message: newAddressMessage,
      });

      const jsonArray = [
        "&linkAddress",
        selectedAccountId.toString(),
        primarySignature,
        selectedLinkWallet.address.toString().toLowerCase().trim(),
        newAddressSignature,
        "false",
      ];
      const jsonArrayString = JSON.stringify(jsonArray);
      await postToBatcher(jsonArrayString, selectedWallet);
      showNotification(
        "success",
        "Address Linked",
        "Successfully linked address to account! Use the refresh button to see updated addresses.",
      );
      setSelectedLinkWallet(null);
    } catch (error) {
      showNotification(
        "error",
        "Link Address Error",
        `Error linking address: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
      );
    } finally {
      setCommandLoading(false);
    }
  };

  const fetchAddresses = async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch(ADDRESSES_ENDPOINT);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      setAddresses(data);
    } catch (err) {
      console.error("Error fetching addresses:", err);
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAddresses();
  }, []);

  // Group addresses by account_id
  const groupedAddresses = addresses.reduce((groups: GroupedAddress[], row) => {
    const existingGroup = groups.find((group) =>
      group.account_id === row.account_id
    );

    if (existingGroup) {
      // Add address to existing group if not already present
      if (!existingGroup.addresses.includes(row.address)) {
        existingGroup.addresses.push(row.address);
      }
      // Update primary address info if this row has a primary address
      if (row.primary_address) {
        existingGroup.hasPrimaryAddress = true;
        existingGroup.primaryAddress = row.primary_address;
      }
    } else {
      // Create new group
      groups.push({
        account_id: row.account_id,
        addresses: [row.address],
        hasPrimaryAddress: !!row.primary_address,
        primaryAddress: row.primary_address,
      });
    }

    return groups;
  }, []);

  // Get unique account IDs for dropdown
  const accountIds = [
    ...new Set(
      groupedAddresses.map((group) => group.account_id).filter((id) =>
        id !== null
      ),
    ),
  ] as number[];

  if (loading) {
    return (
      <div className="addresses-loading">
        <div className="loading-text">Loading addresses...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="addresses-error">
        <div className="error-text">Error loading addresses: {error}</div>
      </div>
    );
  }

  return (
    <div className="addresses-table-container">
      {/* Notifications */}
      <div
        style={{
          position: "fixed",
          top: "20px",
          right: "20px",
          zIndex: 1000,
          display: "flex",
          flexDirection: "column",
          gap: "10px",
        }}
      >
        {notifications.map((notification) => (
          <div
            key={notification.id}
            style={{
              background: notification.type === "success"
                ? "#10b981"
                : notification.type === "error"
                ? "#ef4444"
                : "#3b82f6",
              color: "white",
              padding: "12px 16px",
              borderRadius: "8px",
              minWidth: "300px",
              boxShadow: "0 4px 12px rgba(0, 0, 0, 0.15)",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-start",
              animation: "slideIn 0.3s ease-out",
            }}
          >
            <div>
              <div style={{ fontWeight: "600", marginBottom: "4px" }}>
                {notification.title}
              </div>
              <div style={{ fontSize: "14px", opacity: 0.9 }}>
                {notification.message}
              </div>
            </div>
            <button
              onClick={() => removeNotification(notification.id)}
              style={{
                background: "none",
                border: "none",
                color: "white",
                cursor: "pointer",
                fontSize: "18px",
                padding: "0",
                marginLeft: "12px",
                opacity: 0.7,
              }}
            >
              ×
            </button>
          </div>
        ))}
      </div>

      {/* Wallet Management Section */}
      <div
        style={{
          marginBottom: "20px",
          padding: "20px",
          border: "1px solid #ddd",
          borderRadius: "8px",
          background: "#f8fafc",
        }}
      >
        <div
          onClick={() => setIsWalletSectionCollapsed(!isWalletSectionCollapsed)}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            cursor: "pointer",
            marginBottom: isWalletSectionCollapsed ? 0 : "20px",
          }}
        >
          <h3 style={{ margin: 0, color: "#333" }}>Wallet Management</h3>
          <span
            style={{
              fontSize: "18px",
              color: "#666",
              transform: isWalletSectionCollapsed
                ? "rotate(0deg)"
                : "rotate(180deg)",
              transition: "transform 0.2s ease-in-out",
            }}
          >
            ▼
          </span>
        </div>

        {!isWalletSectionCollapsed && (
          <>
            {/* Generate New Wallet */}
            <div style={{ marginBottom: "20px" }}>
              <button
                onClick={generateNewWallet}
                style={{
                  padding: "10px 16px",
                  background: "linear-gradient(45deg, #19b17b, #022418)",
                  color: "white",
                  border: "none",
                  borderRadius: "6px",
                  cursor: "pointer",
                  fontWeight: "600",
                  fontSize: "14px",
                }}
              >
                Generate New EVM Wallet
              </button>
            </div>

            {/* Wallet List */}
            {wallets.length > 0 && (
              <div style={{ marginBottom: "20px" }}>
                <h4 style={{ margin: "0 0 10px 0", color: "#333" }}>
                  Available Wallets:
                </h4>
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "10px",
                  }}
                >
                  {wallets.map((wallet) => (
                    <div
                      key={wallet.id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "10px",
                        padding: "10px",
                        border: selectedWallet?.id === wallet.id
                          ? "2px solid #19b17b"
                          : "1px solid #ddd",
                        borderRadius: "6px",
                        background: selectedWallet?.id === wallet.id
                          ? "#f0fdf4"
                          : "white",
                      }}
                    >
                      <input
                        type="radio"
                        name="selectedWallet"
                        checked={selectedWallet?.id === wallet.id}
                        onChange={() => setSelectedWallet(wallet)}
                        style={{ margin: 0 }}
                      />
                      <span
                        style={{
                          fontSize: "14px",
                          fontFamily: "monospace",
                          color: "#666",
                          flex: "1",
                        }}
                      >
                        {wallet.name}
                      </span>
                      {
                        /* <input
                        type="text"
                        value={wallet.name}
                        onChange={(e) =>
                          updateWalletName(wallet.id, e.target.value)}
                        style={{
                          padding: "4px 8px",
                          border: "1px solid #ddd",
                          borderRadius: "4px",
                          fontSize: "14px",
                          flex: "1",
                        }}
                      /> */
                      }
                      <span
                        style={{
                          fontSize: "14px",
                          fontFamily: "monospace",
                          color: "#666",
                          flex: "2",
                        }}
                      >
                        {wallet.address}
                      </span>
                      <button
                        onClick={() => removeWallet(wallet.id)}
                        style={{
                          padding: "4px 8px",
                          background: "#ef4444",
                          color: "white",
                          border: "none",
                          borderRadius: "4px",
                          cursor: "pointer",
                          fontSize: "12px",
                        }}
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Account Commands Section */}
      {selectedWallet && (
        <div
          style={{
            marginBottom: "20px",
            padding: "20px",
            border: "1px solid #ddd",
            borderRadius: "8px",
            background: "#fef7ff",
          }}
        >
          <div
            onClick={() =>
              setIsCommandsSectionCollapsed(!isCommandsSectionCollapsed)}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              cursor: "pointer",
              marginBottom: isCommandsSectionCollapsed ? 0 : "20px",
            }}
          >
            <h3 style={{ margin: 0, color: "#333" }}>Account Commands</h3>
            <span
              style={{
                fontSize: "18px",
                color: "#666",
                transform: isCommandsSectionCollapsed
                  ? "rotate(0deg)"
                  : "rotate(180deg)",
                transition: "transform 0.2s ease-in-out",
              }}
            >
              ▼
            </span>
          </div>

          {!isCommandsSectionCollapsed && (
            <>
              {/* Action Selection */}
              <div style={{ marginBottom: "20px" }}>
                <label
                  style={{
                    display: "block",
                    marginBottom: "10px",
                    fontWeight: "600",
                    fontSize: "16px",
                  }}
                >
                  What would you like to do?
                </label>
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "10px",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "10px",
                      padding: "12px",
                      border: selectedAction === "create"
                        ? "2px solid #19b17b"
                        : "1px solid #ddd",
                      borderRadius: "6px",
                      background: selectedAction === "create"
                        ? "#f0fdf4"
                        : "white",
                      cursor: "pointer",
                    }}
                    onClick={() => setSelectedAction("create")}
                  >
                    <input
                      type="radio"
                      name="action"
                      checked={selectedAction === "create"}
                      onChange={() => setSelectedAction("create")}
                      style={{ margin: 0 }}
                    />
                    <div style={{ flex: "1" }}>
                      <div style={{ fontWeight: "600", marginBottom: "4px" }}>
                        1. Create new account
                      </div>
                      <div
                        style={{
                          fontSize: "14px",
                          color: "#666",
                          fontStyle: "italic",
                        }}
                      >
                        Can only create if not linked to any account
                      </div>
                    </div>
                  </div>

                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "10px",
                      padding: "12px",
                      border: selectedAction === "link"
                        ? "2px solid #3b82f6"
                        : "1px solid #ddd",
                      borderRadius: "6px",
                      background: selectedAction === "link"
                        ? "#eff6ff"
                        : "white",
                      cursor: "pointer",
                    }}
                    onClick={() => setSelectedAction("link")}
                  >
                    <input
                      type="radio"
                      name="action"
                      checked={selectedAction === "link"}
                      onChange={() => setSelectedAction("link")}
                      style={{ margin: 0 }}
                    />
                    <div style={{ flex: "1" }}>
                      <div style={{ fontWeight: "600", marginBottom: "4px" }}>
                        2. Link Account
                      </div>
                      <div
                        style={{
                          fontSize: "14px",
                          color: "#666",
                          fontStyle: "italic",
                        }}
                      >
                        Only Account Primary can do this Action
                      </div>
                    </div>
                  </div>

                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "10px",
                      padding: "12px",
                      border: selectedAction === "unlink-other"
                        ? "2px solid #f59e0b"
                        : "1px solid #ddd",
                      borderRadius: "6px",
                      background: selectedAction === "unlink-other"
                        ? "#fffbeb"
                        : "white",
                      cursor: "pointer",
                    }}
                    onClick={() => setSelectedAction("unlink-other")}
                  >
                    <input
                      type="radio"
                      name="action"
                      checked={selectedAction === "unlink-other"}
                      onChange={() => setSelectedAction("unlink-other")}
                      style={{ margin: 0 }}
                    />
                    <div style={{ flex: "1" }}>
                      <div style={{ fontWeight: "600", marginBottom: "4px" }}>
                        3. Unlink Account
                      </div>
                      <div
                        style={{
                          fontSize: "14px",
                          color: "#666",
                          fontStyle: "italic",
                        }}
                      >
                        Only Account Primary can do this Action
                      </div>
                    </div>
                  </div>

                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "10px",
                      padding: "12px",
                      border: selectedAction === "unlink-self"
                        ? "2px solid #ef4444"
                        : "1px solid #ddd",
                      borderRadius: "6px",
                      background: selectedAction === "unlink-self"
                        ? "#fef2f2"
                        : "white",
                      cursor: "pointer",
                    }}
                    onClick={() => setSelectedAction("unlink-self")}
                  >
                    <input
                      type="radio"
                      name="action"
                      checked={selectedAction === "unlink-self"}
                      onChange={() => setSelectedAction("unlink-self")}
                      style={{ margin: 0 }}
                    />
                    <div style={{ flex: "1" }}>
                      <div style={{ fontWeight: "600", marginBottom: "4px" }}>
                        4. Unlink Self
                      </div>
                      <div
                        style={{
                          fontSize: "14px",
                          color: "#666",
                          fontStyle: "italic",
                        }}
                      >
                        Unlink self from account
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Action-specific UI */}
              {selectedAction && (
                <div
                  style={{
                    marginTop: "20px",
                    padding: "20px",
                    background: "#f8fafc",
                    borderRadius: "8px",
                    border: "1px solid #e2e8f0",
                  }}
                >
                  {selectedAction === "create" && (
                    <div>
                      <h4 style={{ margin: "0 0 15px 0", color: "#333" }}>
                        Create New Account
                      </h4>
                      <p
                        style={{
                          margin: "0 0 15px 0",
                          color: "#666",
                          fontSize: "14px",
                        }}
                      >
                        This will create a new account with your selected wallet
                        as the primary address.
                      </p>
                      <button
                        onClick={executeCreateAccount}
                        disabled={commandLoading}
                        style={{
                          padding: "10px 20px",
                          background: commandLoading
                            ? "#ccc"
                            : "linear-gradient(45deg, #19b17b, #022418)",
                          color: "white",
                          border: "none",
                          borderRadius: "6px",
                          cursor: commandLoading ? "not-allowed" : "pointer",
                          fontWeight: "600",
                          fontSize: "14px",
                        }}
                      >
                        {commandLoading ? "Creating..." : "Create Account"}
                      </button>
                    </div>
                  )}

                  {selectedAction === "link" && (
                    <div>
                      <h4 style={{ margin: "0 0 15px 0", color: "#333" }}>
                        Link Account
                      </h4>
                      <p
                        style={{
                          margin: "0 0 15px 0",
                          color: "#666",
                          fontSize: "14px",
                        }}
                      >
                        Link a wallet to an existing account. You must be the
                        primary address of the account, and the wallet to link
                        must have a private key.
                      </p>
                      <div style={{ marginBottom: "15px" }}>
                        <label
                          style={{
                            display: "block",
                            marginBottom: "5px",
                            fontWeight: "600",
                          }}
                        >
                          Account ID:
                        </label>
                        <select
                          value={selectedAccountId || ""}
                          onChange={(e) =>
                            setSelectedAccountId(
                              e.target.value ? parseInt(e.target.value) : null,
                            )}
                          style={{
                            padding: "8px",
                            border: "1px solid #ddd",
                            borderRadius: "4px",
                            width: "200px",
                          }}
                        >
                          <option value="">-- Select Account ID --</option>
                          {accountIds.map((id) => (
                            <option key={id} value={id}>
                              Account {id}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div style={{ marginBottom: "15px" }}>
                        <label
                          style={{
                            display: "block",
                            marginBottom: "5px",
                            fontWeight: "600",
                          }}
                        >
                          Wallet to Link:
                        </label>
                        <select
                          value={selectedLinkWallet?.id || ""}
                          onChange={(e) => {
                            const wallet = wallets.find((w) =>
                              w.id === e.target.value
                            );
                            setSelectedLinkWallet(wallet || null);
                          }}
                          style={{
                            padding: "8px",
                            border: "1px solid #ddd",
                            borderRadius: "4px",
                            width: "300px",
                          }}
                        >
                          <option value="">
                            -- Select a wallet to link --
                          </option>
                          {wallets
                            .filter((wallet) =>
                              wallet.id !== selectedWallet?.id
                            ) // Exclude the currently selected wallet
                            .map((wallet) => (
                              <option key={wallet.id} value={wallet.id}>
                                {wallet.name} ({wallet.address})
                              </option>
                            ))}
                        </select>
                      </div>
                      <button
                        onClick={executeLinkAddress}
                        disabled={commandLoading || !selectedAccountId ||
                          !selectedLinkWallet}
                        style={{
                          padding: "10px 20px",
                          background: (commandLoading || !selectedAccountId ||
                              !selectedLinkWallet)
                            ? "#ccc"
                            : "linear-gradient(45deg, #3b82f6, #1e3a8a)",
                          color: "white",
                          border: "none",
                          borderRadius: "6px",
                          cursor: (commandLoading || !selectedAccountId ||
                              !selectedLinkWallet)
                            ? "not-allowed"
                            : "pointer",
                          fontWeight: "600",
                          fontSize: "14px",
                        }}
                      >
                        {commandLoading ? "Linking..." : "Link Wallet"}
                      </button>
                    </div>
                  )}

                  {selectedAction === "unlink-other" && (
                    <div>
                      <h4 style={{ margin: "0 0 15px 0", color: "#333" }}>
                        Unlink Account
                      </h4>
                      <p
                        style={{
                          margin: "0 0 15px 0",
                          color: "#666",
                          fontSize: "14px",
                        }}
                      >
                        Unlink a specific address from an account. You must be
                        the primary address of the account.
                      </p>
                      <div style={{ marginBottom: "15px" }}>
                        <label
                          style={{
                            display: "block",
                            marginBottom: "5px",
                            fontWeight: "600",
                          }}
                        >
                          Account ID:
                        </label>
                        <select
                          value={selectedAccountId || ""}
                          onChange={(e) =>
                            setSelectedAccountId(
                              e.target.value ? parseInt(e.target.value) : null,
                            )}
                          style={{
                            padding: "8px",
                            border: "1px solid #ddd",
                            borderRadius: "4px",
                            width: "200px",
                          }}
                        >
                          <option value="">-- Select Account ID --</option>
                          {accountIds.map((id) => (
                            <option key={id} value={id}>
                              Account {id}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div style={{ marginBottom: "15px" }}>
                        <label
                          style={{
                            display: "block",
                            marginBottom: "5px",
                            fontWeight: "600",
                          }}
                        >
                          Address to Unlink:
                        </label>
                        <input
                          type="text"
                          value={unlinkAddress}
                          onChange={(e) => setUnlinkAddress(e.target.value)}
                          placeholder="Enter address to unlink"
                          style={{
                            padding: "8px",
                            border: "1px solid #ddd",
                            borderRadius: "4px",
                            width: "300px",
                          }}
                        />
                      </div>
                      <button
                        onClick={executeUnlinkOther}
                        disabled={commandLoading || !selectedAccountId ||
                          !unlinkAddress.trim()}
                        style={{
                          padding: "10px 20px",
                          background: (commandLoading || !selectedAccountId ||
                              !unlinkAddress.trim())
                            ? "#ccc"
                            : "linear-gradient(45deg, #f59e0b, #92400e)",
                          color: "white",
                          border: "none",
                          borderRadius: "6px",
                          cursor: (commandLoading || !selectedAccountId ||
                              !unlinkAddress.trim())
                            ? "not-allowed"
                            : "pointer",
                          fontWeight: "600",
                          fontSize: "14px",
                        }}
                      >
                        {commandLoading ? "Unlinking..." : "Unlink Address"}
                      </button>
                    </div>
                  )}

                  {selectedAction === "unlink-self" && (
                    <div>
                      <h4 style={{ margin: "0 0 15px 0", color: "#333" }}>
                        Unlink Self
                      </h4>
                      <p
                        style={{
                          margin: "0 0 15px 0",
                          color: "#666",
                          fontSize: "14px",
                        }}
                      >
                        Unlink yourself from an account. This will remove your
                        address from the account.
                      </p>
                      <div style={{ marginBottom: "15px" }}>
                        <label
                          style={{
                            display: "block",
                            marginBottom: "5px",
                            fontWeight: "600",
                          }}
                        >
                          Account ID:
                        </label>
                        <select
                          value={selectedAccountId || ""}
                          onChange={(e) =>
                            setSelectedAccountId(
                              e.target.value ? parseInt(e.target.value) : null,
                            )}
                          style={{
                            padding: "8px",
                            border: "1px solid #ddd",
                            borderRadius: "4px",
                            width: "200px",
                          }}
                        >
                          <option value="">-- Select Account ID --</option>
                          {accountIds.map((id) => (
                            <option key={id} value={id}>
                              Account {id}
                            </option>
                          ))}
                        </select>
                      </div>
                      <button
                        onClick={executeUnlinkSelf}
                        disabled={commandLoading || !selectedAccountId}
                        style={{
                          padding: "10px 20px",
                          background: (commandLoading || !selectedAccountId)
                            ? "#ccc"
                            : "linear-gradient(45deg, #ef4444, #7f1d1d)",
                          color: "white",
                          border: "none",
                          borderRadius: "6px",
                          cursor: (commandLoading || !selectedAccountId)
                            ? "not-allowed"
                            : "pointer",
                          fontWeight: "600",
                          fontSize: "14px",
                        }}
                      >
                        {commandLoading ? "Unlinking..." : "Unlink Self"}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Addresses Table */}
      <div className="addresses-table-wrapper">
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "15px",
          }}
        >
          <h3 style={{ margin: 0, color: "#333" }}>Addresses</h3>
          <button
            onClick={fetchAddresses}
            disabled={loading}
            style={{
              padding: "8px 16px",
              background: loading
                ? "#ccc"
                : "linear-gradient(45deg, #19b17b, #022418)",
              color: "white",
              border: "none",
              borderRadius: "6px",
              cursor: loading ? "not-allowed" : "pointer",
              fontWeight: "600",
              fontSize: "14px",
              display: "flex",
              alignItems: "center",
              gap: "8px",
            }}
          >
            <span style={{ fontSize: "16px" }}>
              {loading ? "⏳" : "🔄"}
            </span>
            {loading ? "Refreshing..." : "Refresh Addresses"}
          </button>
        </div>
        <table className="addresses-table">
          <thead>
            <tr>
              <th>Account ID</th>
              <th>Addresses</th>
            </tr>
          </thead>
          <tbody>
            {groupedAddresses.map((group, index) => (
              <tr
                key={group.account_id ?? `null-${index}`}
                className={group.hasPrimaryAddress ? "has-primary-address" : ""}
              >
                <td className="account-id-cell">
                  <div className="account-id-content">
                    {group.account_id ?? "No Account ID"}
                  </div>
                </td>
                <td className="addresses-cell">
                  {group.addresses.map((address, addrIndex) => (
                    <div
                      key={address}
                      className={`address-item ${
                        address === group.primaryAddress
                          ? "primary-address"
                          : ""
                      }`}
                      title={address === group.primaryAddress
                        ? `${address} (Primary)`
                        : address}
                    >
                      {address}
                      {address === group.primaryAddress && (
                        <span className="primary-badge">Primary</span>
                      )}
                    </div>
                  ))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {groupedAddresses.length === 0 && (
        <div className="no-addresses">
          <div className="no-data-text">No addresses found</div>
        </div>
      )}

      {/* CSS Animation */}
      <style>
        {`
          @keyframes slideIn {
            from {
              transform: translateX(100%);
              opacity: 0;
            }
            to {
              transform: translateX(0);
              opacity: 1;
            }
          }
        `}
      </style>
    </div>
  );
}
