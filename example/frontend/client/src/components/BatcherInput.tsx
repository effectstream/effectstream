import { useState } from "react";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { createWalletClient, http } from "viem";
import { hardhat } from "viem/chains";

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
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async () => {
    if (!input.trim()) {
      alert("Please enter a JSON array string");
      return;
    }

    // Validate JSON format
    try {
      JSON.parse(input);
    } catch (e) {
      alert(
        'Invalid JSON format. Please enter a valid JSON array like ["attack", 5, 10]',
      );
      return;
    }

    setIsLoading(true);

    try {
      await postToBatcher(input);
      alert("Successfully sent to batcher! Check console for details.");
      setInput(""); // Clear input on success
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
    <div style={{ marginBottom: "20px" }}>
      <input
        type="text"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        placeholder='Enter JSON array: ["attack", 5, 10]'
        disabled={isLoading}
        style={{
          padding: "10px",
          width: "300px",
          border: "2px solid #667eea",
          borderRadius: "8px",
          marginRight: "10px",
        }}
      />
      <button
        onClick={handleSubmit}
        disabled={isLoading}
        style={{
          padding: "10px 20px",
          background: "linear-gradient(45deg, #667eea, #764ba2)",
          color: "white",
          border: "none",
          borderRadius: "8px",
          cursor: isLoading ? "not-allowed" : "pointer",
          fontWeight: "600",
          opacity: isLoading ? 0.6 : 1,
        }}
      >
        {isLoading ? "Sending..." : "Send to Batcher"}
      </button>
    </div>
  );
}
