import { useState, useCallback, useEffect, useRef } from 'react';
import { Header } from './components/Header';
import { MintModal } from './components/MintModal';
import { SwapInterface } from './components/SwapInterface';
import { ZSwapList } from './components/ZSwapList';
import { EventFeed } from './components/EventFeed';
import { WalletBalances } from './components/WalletBalances';
import { useTokens } from './hooks/useTokens';
import { useEventStream } from './hooks/useEventStream';
import { useActiveWallet, BROWSER_WALLET_ID } from './hooks/useActiveWallet';
import { useWallet } from './hooks/useWallet';
import { useContract } from './hooks/useContract';
import { useMintReconciler } from './hooks/useMintReconciler';
import type { AppEvent } from './types';
import './styles/index.css';

function App() {
  const [isMintModalOpen, setIsMintModalOpen] = useState(false);
  const { knownTokens, refetchTokens } = useTokens();
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [sseRefreshTrigger, setSseRefreshTrigger] = useState(0);
  const [balanceRefreshTrigger, setBalanceRefreshTrigger] = useState(0);

  const wallet = useWallet();
  const browserAvailable = wallet.status === 'connected';
  const { wallets, activeWallet, setActiveWallet } = useActiveWallet(browserAvailable);
  const browserContract = useContract(wallet.connectedApi);

  const prevWalletStatus = useRef(wallet.status);
  useEffect(() => {
    if (prevWalletStatus.current !== 'connected' && wallet.status === 'connected') {
      setActiveWallet(BROWSER_WALLET_ID);
    }
    prevWalletStatus.current = wallet.status;
  }, [wallet.status, setActiveWallet]);

  useMintReconciler(wallet.connectedApi, knownTokens, balanceRefreshTrigger, refetchTokens);

  const handleSSEEvent = useCallback((event: AppEvent) => {
    if (event.type === 'offer_indexed' || event.type === 'offer_consumed') {
      setSseRefreshTrigger(prev => prev + 1);
    }
    if (event.type === 'token_minted') {
      refetchTokens();
    }
    if (event.type === 'token_minted' || event.type === 'offer_consumed' || event.type === 'faucet_sent') {
      setBalanceRefreshTrigger(prev => prev + 1);
      wallet.refreshBalances();
    }
  }, [refetchTokens, wallet]);

  const { events, isConnected, clearEvents } = useEventStream(handleSSEEvent);

  const handleMintSuccess = () => {
    refetchTokens();
    wallet.refreshBalances();
  };

  const handleSwapSuccess = () => {
    setRefreshTrigger(prev => prev + 1);
  };

  const isBrowserActive = activeWallet === BROWSER_WALLET_ID;

  const handleRefreshBalances = useCallback(async () => {
    setBalanceRefreshTrigger(prev => prev + 1);
    if (wallet.status === 'connected') {
      await wallet.refreshBalances();
    }
  }, [wallet]);

  return (
    <>
      <Header
        onOpenMintModal={() => setIsMintModalOpen(true)}
        wallets={wallets}
        activeWallet={activeWallet}
        onWalletChange={setActiveWallet}
        wallet={wallet}
      />

      <MintModal
        isOpen={isMintModalOpen}
        onClose={() => setIsMintModalOpen(false)}
        onMintSuccess={handleMintSuccess}
        activeWallet={activeWallet}
        connectedApi={isBrowserActive ? wallet.connectedApi : null}
        browserContract={isBrowserActive ? browserContract : null}
      />

      <div className="main-columns">
        <div className="column column-side">
          <ZSwapList
            knownTokens={knownTokens}
            refreshTrigger={refreshTrigger}
            sseRefreshTrigger={sseRefreshTrigger}
            activeWallet={activeWallet}
            connectedApi={isBrowserActive ? wallet.connectedApi : null}
          />
        </div>

        <div className="column column-center">
          <SwapInterface
            knownTokens={knownTokens}
            onSuccess={handleSwapSuccess}
            activeWallet={activeWallet}
            connectedApi={isBrowserActive ? wallet.connectedApi : null}
            browserShieldedAddress={isBrowserActive ? wallet.shieldedAddress : null}
          />
        </div>

        <div className="column column-side">
          <EventFeed
            events={events}
            isConnected={isConnected}
            onClear={clearEvents}
          />
          <WalletBalances
            activeWallet={activeWallet}
            knownTokens={knownTokens}
            balanceRefreshTrigger={balanceRefreshTrigger}
            browserBalances={isBrowserActive ? wallet.shieldedBalances : null}
            browserUnshieldedBalances={isBrowserActive ? wallet.unshieldedBalances : null}
            onRefresh={handleRefreshBalances}
            refreshing={isBrowserActive && wallet.refreshing}
          />
        </div>
      </div>
    </>
  );
}

export default App;
