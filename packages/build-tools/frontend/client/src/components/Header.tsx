import { useState } from "react";
import { Modal } from "./Modal.tsx";

interface HeaderProps {
  latestBlock: number;
  isConnected: boolean;
}

export function Header({ latestBlock, isConnected }: HeaderProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isNodeModalOpen, setIsNodeModalOpen] = useState(false);

  const handleOpenModal = () => {
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
  };

  const handleOpenNodeModal = () => {
    setIsNodeModalOpen(true);
  };

  const handleCloseNodeModal = () => {
    setIsNodeModalOpen(false);
  };

  return (
    <>
      <header className="header">
        <h1 className="title">Paima Explorer</h1>
        <div className="header-right">
          <button
            className="batcher-api-button"
            onClick={handleOpenModal}
          >
            Batcher API
          </button>
          <button
            className="node-api-button"
            onClick={handleOpenNodeModal}
          >
            Paima Engine Node API
          </button>
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
        </div>
      </header>

      <Modal
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        title="Batcher API Documentation"
      >
        <div className="documentation-content">
          <iframe
            src="http://localhost:3334/documentation"
            className="documentation-iframe"
            title="Batcher API Documentation"
          />
        </div>
      </Modal>

      <Modal
        isOpen={isNodeModalOpen}
        onClose={handleCloseNodeModal}
        title="Paima Engine Node API Documentation"
      >
        <div className="documentation-content">
          <iframe
            src="http://localhost:9999/documentation"
            className="documentation-iframe"
            title="Paima Engine Node API Documentation"
          />
        </div>
      </Modal>
    </>
  );
}
