interface HeaderProps {
  latestBlock: number;
  isConnected: boolean;
}

export function Header({ latestBlock, isConnected }: HeaderProps) {
  return (
    <header className="header">
      <h1 className="title">Paima Explorer</h1>
      <div className="block-info">
        <span>Latest Block:</span>
        <span
          id="latest-block"
          style={{
            backgroundColor: isConnected
              ? "rgba(76, 175, 80, 0.1)"
              : "rgba(244, 67, 54, 0.1)",
            color: isConnected ? "#4caf50" : "#f44336",
          }}
        >
          {isConnected ? latestBlock.toLocaleString() : "Connection Error"}
        </span>
      </div>
    </header>
  );
}
