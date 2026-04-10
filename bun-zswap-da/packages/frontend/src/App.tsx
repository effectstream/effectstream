import { useState, useCallback } from 'react';
import { Header } from './components/Header';
import { MintModal } from './components/MintModal';
import { SwapInterface } from './components/SwapInterface';
import { ZSwapList } from './components/ZSwapList';
import { EventFeed } from './components/EventFeed';
import { useTokens } from './hooks/useTokens';
import { useEventStream } from './hooks/useEventStream';
import type { AppEvent } from './types';
import './styles/index.css';

function App() {
  const [isMintModalOpen, setIsMintModalOpen] = useState(false);
  const { knownTokens, refetchTokens } = useTokens();
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [sseRefreshTrigger, setSseRefreshTrigger] = useState(0);

  const handleSSEEvent = useCallback((event: AppEvent) => {
    if (event.type === 'offer_indexed' || event.type === 'offer_consumed') {
      setSseRefreshTrigger(prev => prev + 1);
    }
  }, []);

  const { events, isConnected, clearEvents } = useEventStream(handleSSEEvent);

  const handleMintSuccess = () => {
    refetchTokens();
  };

  const handleSwapSuccess = () => {
    setRefreshTrigger(prev => prev + 1);
  };

  return (
    <>
      <Header onOpenMintModal={() => setIsMintModalOpen(true)} />

      <MintModal
        isOpen={isMintModalOpen}
        onClose={() => setIsMintModalOpen(false)}
        onMintSuccess={handleMintSuccess}
      />

      <SwapInterface
        knownTokens={knownTokens}
        onSuccess={handleSwapSuccess}
      />

      <ZSwapList
        knownTokens={knownTokens}
        refreshTrigger={refreshTrigger}
        sseRefreshTrigger={sseRefreshTrigger}
      />

      <EventFeed
        events={events}
        isConnected={isConnected}
        onClear={clearEvents}
      />
    </>
  );
}

export default App;
