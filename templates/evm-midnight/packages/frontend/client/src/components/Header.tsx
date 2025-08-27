import { useEffect, useRef, useState } from "react";
import { Modal } from "./Modal.tsx";
import { AddressesTable } from "./AddressesTable.tsx";
import {
  BATCHER_OPENAPI_URL,
  DOCUMENTATION_URL,
  ENGINE_OPENAPI_URL,
} from "../config.ts";
import { useWallet } from "../contexts/WalletContext.tsx";
import { WalletModal } from "./WalletModal.tsx";

interface HeaderProps {
  latestBlock: number;
  isConnected: boolean;
}

export function Header({ latestBlock, isConnected }: HeaderProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isNodeModalOpen, setIsNodeModalOpen] = useState(false);
  const [isDocModalOpen, setIsDocModalOpen] = useState(false);
  const [isAddressModalOpen, setIsAddressModalOpen] = useState(false);
  const [isDocsDropdownOpen, setIsDocsDropdownOpen] = useState(false);

  const {
    isConnected: walletConnected,
    address,
    connectEvmWallet,
    connectLocalWallet,
    disconnectWallet,
    isModalOpen: isWalletModalOpen,
    openModal: openWalletModal,
    closeModal: closeWalletModal,
  } = useWallet();

  const docsDropdownRef = useRef<HTMLDivElement>(null);

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

  const handleWalletConnect = () => {
    openWalletModal();
  };

  const handleConnectLocal = async () => {
    try {
      await connectLocalWallet();
      closeWalletModal();
    } catch (error) {
      console.error("Failed to connect local wallet:", error);
    }
  };

  const handleConnectBrowser = async () => {
    try {
      await connectEvmWallet();
      closeWalletModal();
    } catch (error) {
      console.error("Failed to connect browser wallet:", error);
    }
  };

  const handleWalletDisconnect = () => {
    disconnectWallet();
  };

  const toggleDocsDropdown = () => {
    setIsDocsDropdownOpen(!isDocsDropdownOpen);
  };

  const closeDocsDropdown = () => {
    setIsDocsDropdownOpen(false);
  };

  // Handle clicking outside the dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        docsDropdownRef.current &&
        !docsDropdownRef.current.contains(event.target as Node)
      ) {
        setIsDocsDropdownOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  return (
    <>
      <header className="header">
        <h1 className="title">Midnight/EVM</h1>
        <div className="header-right">
          <div className="docs-dropdown" ref={docsDropdownRef}>
            <button
              type="button"
              className="docs-button"
              onClick={toggleDocsDropdown}
            >
              Docs ▼
            </button>
            {isDocsDropdownOpen && (
              <div className="docs-dropdown-menu">
                <button
                  type="button"
                  className="dropdown-item"
                  onClick={() => {
                    handleOpenModal();
                    closeDocsDropdown();
                  }}
                >
                  Batcher API
                </button>
                <button
                  type="button"
                  className="dropdown-item"
                  onClick={() => {
                    handleOpenNodeModal();
                    closeDocsDropdown();
                  }}
                >
                  Paima Engine Node API
                </button>
                <button
                  type="button"
                  className="dropdown-item"
                  onClick={() => {
                    handleOpenDocModal();
                    closeDocsDropdown();
                  }}
                >
                  Documentation
                </button>
                <button
                  type="button"
                  className="dropdown-item"
                  onClick={() => {
                    handleOpenAddressModal();
                    closeDocsDropdown();
                  }}
                >
                  Addresses
                </button>
              </div>
            )}
          </div>
          {walletConnected
            ? (
              <div className="wallet-info">
                <div className="wallet-address">
                  {address?.slice(0, 6)}...{address?.slice(-4)}
                </div>
                <button
                  type="button"
                  className="wallet-disconnect-button"
                  onClick={handleWalletDisconnect}
                >
                  Disconnect
                </button>
              </div>
            )
            : (
              <button
                type="button"
                className="wallet-connect-button"
                onClick={handleWalletConnect}
              >
                Connect Wallet
              </button>
            )}
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
      <WalletModal
        isOpen={isWalletModalOpen}
        onClose={closeWalletModal}
        onConnectLocal={handleConnectLocal}
        onConnectBrowser={handleConnectBrowser}
      />

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
