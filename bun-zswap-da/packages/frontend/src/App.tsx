import { useState } from 'react';
import { Header } from './components/Header';
import { MintModal } from './components/MintModal';
import { SwapInterface } from './components/SwapInterface';
import { ZSwapList } from './components/ZSwapList';
import { useTokens } from './hooks/useTokens';
import './styles/index.css';

function App() {
  const [isMintModalOpen, setIsMintModalOpen] = useState(false);
  const { knownTokens, refetchTokens } = useTokens();
  const [refreshTrigger, setRefreshTrigger] = useState(0);

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
      />
    </>
  );
}

export default App;
