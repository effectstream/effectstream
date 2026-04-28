import { useState, useCallback, useMemo } from 'react';
import { Header } from './components/Header';
import { MintModal } from './components/MintModal';
import { SwapInterface } from './components/SwapInterface';
import { ZSwapList } from './components/ZSwapList';
import { EventFeed } from './components/EventFeed';
import { WalletBalances } from './components/WalletBalances';
import { useTokens } from './hooks/useTokens';
import { useEventStream } from './hooks/useEventStream';
import { useAliceBobIdentity } from './hooks/useAliceBobIdentity';
import { useWallet } from './hooks/useWallet';
import { useContract } from './hooks/useContract';
import { useMintReconciler } from './hooks/useMintReconciler';
import type { AppEvent } from './types';
import { unshieldedAddressToHex } from './services/offerSender';
import type { NetworkId } from '@midnight-ntwrk/midnight-js-network-id';
import './styles/index.css';

function App() {
  const [isMintModalOpen, setIsMintModalOpen] = useState(false);
  const { knownTokens, refetchTokens } = useTokens();
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [sseRefreshTrigger, setSseRefreshTrigger] = useState(0);
  const [balanceRefreshTrigger, setBalanceRefreshTrigger] = useState(0);

  const wallet = useWallet();
  const browserContract = useContract(wallet.connectedApi);
  const { selfName, otherName, setSelfName } = useAliceBobIdentity();

  // Hex form of the connected wallet's unshielded UserAddress, used to decide
  // whether an indexed offer was made by us (→ render `selfName`) or by
  // someone else (→ render `otherName`). Recomputed only when address or
  // network id change.
  const selfUnshieldedHex = useMemo(() => {
    if (!wallet.unshieldedAddress || !wallet.networkId) return undefined;
    return unshieldedAddressToHex(wallet.unshieldedAddress, wallet.networkId as NetworkId);
  }, [wallet.unshieldedAddress, wallet.networkId]);

  useMintReconciler(wallet.connectedApi, knownTokens, balanceRefreshTrigger, refetchTokens);

  const handleSSEEvent = useCallback((event: AppEvent) => {
    if (event.type === 'offer_indexed' || event.type === 'offer_consumed') {
      setSseRefreshTrigger(prev => prev + 1);
    }
    if (event.type === 'token_minted') {
      refetchTokens();
    }
    if (event.type === 'token_minted' || event.type === 'offer_consumed') {
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

  const handleRefreshBalances = useCallback(async () => {
    setBalanceRefreshTrigger(prev => prev + 1);
    if (wallet.status === 'connected') {
      await wallet.refreshBalances();
    }
  }, [wallet]);

  const browserAvailable = wallet.status === 'connected';

  return (
    <>
      <Header
        onOpenMintModal={() => setIsMintModalOpen(true)}
        selfName={selfName}
        onSelfNameChange={setSelfName}
        wallet={wallet}
      />

      <MintModal
        isOpen={isMintModalOpen}
        onClose={() => setIsMintModalOpen(false)}
        onMintSuccess={handleMintSuccess}
        connectedApi={browserAvailable ? wallet.connectedApi : null}
        browserContract={browserAvailable ? browserContract : null}
      />

      <div className="main-columns">
        <div className="column column-side">
          <ZSwapList
            knownTokens={knownTokens}
            refreshTrigger={refreshTrigger}
            sseRefreshTrigger={sseRefreshTrigger}
            connectedApi={browserAvailable ? wallet.connectedApi : null}
            selfName={selfName}
            otherName={otherName}
            selfUnshieldedHex={selfUnshieldedHex}
            networkId={wallet.networkId ?? null}
          />
        </div>

        <div className="column column-center">
          <SwapInterface
            knownTokens={knownTokens}
            onSuccess={handleSwapSuccess}
            connectedApi={browserAvailable ? wallet.connectedApi : null}
            browserShieldedAddress={browserAvailable ? wallet.shieldedAddress : null}
            browserUnshieldedAddress={browserAvailable ? wallet.unshieldedAddress : null}
            browserNetworkId={browserAvailable ? wallet.networkId : null}
          />
        </div>

        <div className="column column-side">
          <EventFeed
            events={events}
            isConnected={isConnected}
            onClear={clearEvents}
          />
          <WalletBalances
            knownTokens={knownTokens}
            balanceRefreshTrigger={balanceRefreshTrigger}
            browserBalances={browserAvailable ? wallet.shieldedBalances : null}
            browserUnshieldedBalances={browserAvailable ? wallet.unshieldedBalances : null}
            onRefresh={handleRefreshBalances}
            refreshing={browserAvailable && wallet.refreshing}
          />
        </div>
      </div>
    </>
  );
}

export default App;
