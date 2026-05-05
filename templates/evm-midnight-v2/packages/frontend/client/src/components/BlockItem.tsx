import { useState } from "react";

interface Block {
  number: number;
  hash: string;
  timestamp: Date;
}

interface BlockItemProps {
  block: Block;
  isNew?: boolean;
}

function formatTimestamp(date: Date) {
  return date.toLocaleTimeString("en-US", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function BlockItem({ block, isNew = false }: BlockItemProps) {
  const [isHighlighted, setIsHighlighted] = useState(false);

  const handleClick = async () => {
    try {
      await navigator.clipboard.writeText(block.hash);
      setIsHighlighted(true);
      setTimeout(() => setIsHighlighted(false), 300);
      console.log(`📋 Copied to clipboard: ${block.hash}`);
    } catch (err) {
      console.error("Failed to copy to clipboard:", err);
    }
  };

  return (
    <div
      className={`block-item ${isNew ? "new-block" : ""}`}
      onClick={handleClick}
      style={{
        backgroundColor: isHighlighted ? "rgba(76, 175, 80, 0.2)" : undefined,
        cursor: "pointer",
      }}
    >
      <div className="block-number">Block #{block.number.toLocaleString()}</div>
      <div className="block-hash">{block.hash}</div>
      <div className="block-timestamp">{formatTimestamp(block.timestamp)}</div>
    </div>
  );
}
