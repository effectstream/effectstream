import { useState } from "react";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { createWalletClient, http } from "viem";
import { hardhat } from "viem/chains";
import { grammar } from "@example/data-types";

const BATCHER_ENDPOINT = "http://localhost:3334/send-input";
const AddressType = {
  EVM: 0,
};

async function createSignedInput(gameInput: string) {
  const privateKey = generatePrivateKey();
  const account = privateKeyToAccount(privateKey);
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

async function postToBatcher(jsonArrayString: string) {
  console.log("🚀 Creating signed input for:", jsonArrayString);
  const signedInput = await createSignedInput(jsonArrayString);

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

  const grammarTypes = Object.keys(grammar);

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
      alert("Please select a type");
      return;
    }

    const jsonArray = buildJsonArray();
    if (!jsonArray) {
      alert("Failed to build JSON array");
      return;
    }

    setIsLoading(true);

    try {
      const jsonArrayString = JSON.stringify(jsonArray);
      await postToBatcher(jsonArrayString);
      alert("Successfully sent to batcher! Check console for details.");
      setFormData({});
    } catch (error) {
      alert(
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
      }}
    >
      <h3 style={{ marginTop: 0, color: "#333" }}>Batcher Input</h3>

      {/* Type Selection */}
      <div style={{ marginBottom: "15px" }}>
        <label
          style={{ display: "block", marginBottom: "5px", fontWeight: "600" }}
        >
          Select Type:
        </label>
        <select
          value={selectedType}
          onChange={(e) => handleTypeChange(e.target.value)}
          disabled={isLoading}
          style={{
            padding: "8px",
            border: "2px solid #667eea",
            borderRadius: "4px",
            width: "200px",
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

      {/* Dynamic Form Fields */}
      {selectedType && (
        <div style={{ marginBottom: "15px" }}>
          <h4 style={{ color: "#555" }}>Parameters for {selectedType}:</h4>
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
      )}

      {/* Preview */}
      {selectedType && (
        <div style={{ marginBottom: "15px" }}>
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
        disabled={isLoading || !selectedType}
        style={{
          padding: "10px 20px",
          background: selectedType
            ? "linear-gradient(45deg, #667eea, #764ba2)"
            : "#ccc",
          color: "white",
          border: "none",
          borderRadius: "8px",
          cursor: isLoading || !selectedType ? "not-allowed" : "pointer",
          fontWeight: "600",
          opacity: isLoading ? 0.6 : 1,
        }}
      >
        {isLoading ? "Sending..." : "Send to Batcher"}
      </button>
    </div>
  );
}
