import { useState } from "react";
import { Modal } from "./Modal.tsx";
import { AddressesTable } from "./AddressesTable.tsx";
import {
  BATCHER_OPENAPI_URL,
  DOCUMENTATION_URL,
  ENGINE_OPENAPI_URL,
} from "../config.ts";

interface HeaderProps {
  latestBlock: number;
  isConnected: boolean;
}

export function Header({
  latestBlock,
  isConnected,
}: HeaderProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isNodeModalOpen, setIsNodeModalOpen] = useState(false);
  const [isDocModalOpen, setIsDocModalOpen] = useState(false);
  const [isAddressModalOpen, setIsAddressModalOpen] = useState(false);

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

  const handleOpenDocModal = () => {
    setIsDocModalOpen(true);
  };

  const handleCloseDocModal = () => {
    setIsDocModalOpen(false);
  };

  const handleOpenAddressModal = () => {
    setIsAddressModalOpen(true);
  };

  const handleCloseAddressModal = () => {
    setIsAddressModalOpen(false);
  };

  return (
    <>
      <header className="header">
        <h1 className="title">Paima Explorer</h1>
        <div className="header-right">
          <button
            type="button"
            className="batcher-api-button"
            onClick={handleOpenModal}
          >
            Batcher API
          </button>
          <button
            type="button"
            className="node-api-button"
            onClick={handleOpenNodeModal}
          >
            Paima Engine Node API
          </button>
          <button
            type="button"
            className="documentation-button"
            onClick={handleOpenDocModal}
          >
            Documentation
          </button>
          <button
            type="button"
            className="addresses-button"
            onClick={handleOpenAddressModal}
          >
            Addresses
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
        className="api"
        url={BATCHER_OPENAPI_URL}
      >
        <div className="documentation-content">
          <iframe
            src={BATCHER_OPENAPI_URL}
            className="documentation-iframe"
            title="Batcher API Documentation"
          />
        </div>
      </Modal>

      <Modal
        isOpen={isNodeModalOpen}
        onClose={handleCloseNodeModal}
        title="Paima Engine Node API Documentation"
        className="api"
        url={ENGINE_OPENAPI_URL}
      >
        <div className="documentation-content">
          <iframe
            src={ENGINE_OPENAPI_URL}
            className="documentation-iframe"
            title="Paima Engine Node API Documentation"
          />
        </div>
      </Modal>

      <Modal
        className="docs"
        isOpen={isDocModalOpen}
        onClose={handleCloseDocModal}
        title="Documentation"
        url={DOCUMENTATION_URL}
      >
        <div className="documentation-content">
          <iframe
            src={DOCUMENTATION_URL}
            className="documentation-iframe"
            title="Documentation"
          />
        </div>
      </Modal>

      <Modal
        className="addresses"
        isOpen={isAddressModalOpen}
        onClose={handleCloseAddressModal}
        title="Addresses"
      >
        <AddressesTable />
      </Modal>
    </>
  );
}
