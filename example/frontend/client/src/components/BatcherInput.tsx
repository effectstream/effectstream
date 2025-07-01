import { useState } from "react";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { createWalletClient, http } from "viem";
import { hardhat } from "viem/chains";
import { grammar } from "@example/data-types";

const BATCHER_ENDPOINT = "http://localhost:3334/send-input";
const AddressType = {
  EVM: 0,
};

interface Notification {
  id: number;
  type: "success" | "error" | "info";
  title: string;
  message: string;
}

interface WalletInfo {
  privateKey: `0x${string}`;
  address: `0x${string}`;
}

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

  const signature = await walletClient.signMessage({
    message: JSON.stringify({
      message: gameInput,
      timestamp,
    }),
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

export function BatcherInput() {
  const [selectedType, setSelectedType] = useState<string>("");
  const [formData, setFormData] = useState<Record<string, any>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [wallet, setWallet] = useState<WalletInfo | null>(null);
  const [notifications, setNotifications] = useState<Notification[]>([]);

  const grammarTypes = Object.keys(grammar);

  const generateNewWallet = () => {
    const privateKey = generatePrivateKey();
    const account = privateKeyToAccount(privateKey);
    const newWallet: WalletInfo = {
      privateKey,
      address: account.address,
    };
    setWallet(newWallet);
    showNotification(
      "success",
      "Wallet Generated",
      `New wallet created: ${account.address.slice(0, 6)}...${
        account.address.slice(-4)
      }`,
    );
  };

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

  const handleTypeChange = (type: string) => {
    setSelectedType(type);
    setFormData({});
  };

  const handleInputChange = (fieldName: string, value: any) => {
    setFormData((prev) => ({
      ...prev,
      [fieldName]: value,
    }));
  };

  const buildJsonArray = () => {
    if (!selectedType) return null;

    const result: (string | number | object)[] = [selectedType];
    const typeDefinition = grammar[selectedType as keyof typeof grammar];

    for (const [fieldName, fieldType] of typeDefinition) {
      const value = formData[fieldName];
      if (value !== undefined && value !== "") {
        // Handle different field types
        if (fieldType.type === "integer") {
          result.push(parseInt(value) || 0);
        } else if (fieldType.type === "object") {
          try {
            result.push(typeof value === "string" ? JSON.parse(value) : value);
          } catch {
            result.push(value);
          }
        } else {
          result.push(value);
        }
      }
    }

    return result;
  };

  const renderInputField = (fieldName: string, fieldType: any) => {
    const value = formData[fieldName] || "";

    if (fieldType.type === "integer") {
      return (
        <input
          type="number"
          value={value}
          onChange={(e) => handleInputChange(fieldName, e.target.value)}
          placeholder={`Enter ${fieldName}`}
          style={{
            padding: "8px",
            border: "1px solid #ccc",
            borderRadius: "4px",
            width: "200px",
          }}
        />
      );
    } else if (fieldType.type === "string") {
      return (
        <input
          type="text"
          value={value}
          onChange={(e) => handleInputChange(fieldName, e.target.value)}
          placeholder={`Enter ${fieldName}`}
          style={{
            padding: "8px",
            border: "1px solid #ccc",
            borderRadius: "4px",
            width: "200px",
          }}
        />
      );
    } else if (fieldType.type === "object") {
      return (
        <textarea
          value={typeof value === "string"
            ? value
            : JSON.stringify(value, null, 2)}
          onChange={(e) => handleInputChange(fieldName, e.target.value)}
          placeholder={`Enter ${fieldName} as JSON object`}
          rows={3}
          style={{
            padding: "8px",
            border: "1px solid #ccc",
            borderRadius: "4px",
            width: "300px",
            fontFamily: "monospace",
          }}
        />
      );
    }

    return (
      <input
        type="text"
        value={value}
        onChange={(e) => handleInputChange(fieldName, e.target.value)}
        placeholder={`Enter ${fieldName}`}
        style={{
          padding: "8px",
          border: "1px solid #ccc",
          borderRadius: "4px",
          width: "200px",
        }}
      />
    );
  };

  const handleSubmit = async () => {
    if (!selectedType) {
      showNotification("error", "Missing Type", "Please select a type");
      return;
    }

    if (!wallet) {
      showNotification("error", "No Wallet", "Please generate a wallet first");
      return;
    }

    const jsonArray = buildJsonArray();
    if (!jsonArray) {
      showNotification("error", "Invalid Input", "Failed to build JSON array");
      return;
    }

    setIsLoading(true);

    try {
      const jsonArrayString = JSON.stringify(jsonArray);
      await postToBatcher(jsonArrayString, wallet);
      showNotification(
        "success",
        "Success!",
        "Successfully sent to batcher! Check console for details.",
      );
      setFormData({});
    } catch (error) {
      showNotification(
        "error",
        "Batcher Error",
        `Error sending to batcher: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div
      style={{
        marginBottom: "20px",
        padding: "20px",
        border: "1px solid #ddd",
        borderRadius: "8px",
        position: "relative",
      }}
    >
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

      <h3 style={{ marginTop: 0, color: "#333" }}>Batcher Input</h3>

      {/* Wallet Generation and Address Display */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "20px",
          padding: "15px",
          background: "#f8fafc",
          borderRadius: "6px",
          border: "1px solid #e2e8f0",
        }}
      >
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
          Generate new EVM Wallet
        </button>

        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <span
            style={{ fontSize: "14px", color: "#64748b", fontWeight: "500" }}
          >
            Current Address:
          </span>
          <span
            style={{
              fontSize: "14px",
              fontFamily: "monospace",
              background: wallet ? "#e0f2fe" : "#fef3c7",
              padding: "4px 8px",
              borderRadius: "4px",
              color: wallet ? "#0369a1" : "#92400e",
              border: `1px solid ${wallet ? "#bae6fd" : "#fde68a"}`,
            }}
          >
            {wallet
              ? `${wallet.address.slice(0, 6)}...${wallet.address.slice(-4)}`
              : "No wallet generated"}
          </span>
        </div>
      </div>

      {/* Type Selection and Parameters Layout */}
      <div style={{ display: "flex", gap: "30px", alignItems: "flex-start" }}>
        {/* Left Side - Type Selection */}
        <div style={{ flex: "0 0 300px" }}>
          <div style={{ marginBottom: "15px" }}>
            <label
              style={{
                display: "block",
                marginBottom: "25px",
                fontWeight: "600",
              }}
            >
              Select Type:
            </label>
            <select
              value={selectedType}
              onChange={(e) => handleTypeChange(e.target.value)}
              disabled={isLoading}
              style={{
                padding: "8px",
                border: "2px solid #19b17b",
                borderRadius: "4px",
                width: "100%",
              }}
            >
              <option value="">-- Select a type --</option>
              {grammarTypes.map((type) => (
                <option key={type} value={type}>
                  {type.charAt(0).toUpperCase() + type.slice(1)}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Right Side - Parameters */}
        {selectedType && (
          <div style={{ flex: "1", minWidth: "0" }}>
            <div style={{ marginBottom: "15px" }}>
              <label
                style={{
                  display: "block",
                  marginBottom: "5px",
                  fontWeight: "600",
                }}
              >
                Parameters for {selectedType}:
              </label>
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: "15px",
                  alignItems: "flex-end",
                }}
              >
                {grammar[selectedType as keyof typeof grammar].map((
                  [fieldName, fieldType],
                ) => (
                  <div
                    key={fieldName}
                    style={{ display: "flex", flexDirection: "column" }}
                  >
                    <label
                      style={{
                        marginBottom: "5px",
                        fontWeight: "500",
                        fontSize: "14px",
                      }}
                    >
                      {fieldName} ({fieldType.type}):
                    </label>
                    {renderInputField(fieldName, fieldType)}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Preview */}
      {selectedType && (
        <div style={{ marginTop: "20px", marginBottom: "15px" }}>
          <label
            style={{ display: "block", marginBottom: "5px", fontWeight: "500" }}
          >
            Preview JSON Array:
          </label>
          <pre
            style={{
              background: "#f5f5f5",
              padding: "10px",
              borderRadius: "4px",
              border: "1px solid #ddd",
              fontSize: "12px",
              overflow: "auto",
            }}
          >
            {JSON.stringify(buildJsonArray(), null, 2)}
          </pre>
        </div>
      )}

      {/* Submit Button */}
      <button
        onClick={handleSubmit}
        disabled={isLoading || !selectedType || !wallet}
        style={{
          padding: "10px 20px",
          background: (selectedType && wallet)
            ? "linear-gradient(45deg, #19b17b, #022418)"
            : "#ccc",
          color: "white",
          border: "none",
          borderRadius: "8px",
          cursor: (isLoading || !selectedType || !wallet)
            ? "not-allowed"
            : "pointer",
          fontWeight: "600",
          opacity: isLoading ? 0.6 : 1,
        }}
      >
        {isLoading ? "Sending..." : "Send to Batcher"}
      </button>

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
