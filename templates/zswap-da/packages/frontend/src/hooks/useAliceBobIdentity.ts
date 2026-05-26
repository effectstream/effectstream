import { useCallback, useState } from 'react';

const STORAGE_KEY = 'zswap-self-name';

export type AliceBobName = 'alice' | 'bob';

function readStored(): AliceBobName {
  const raw = typeof window === 'undefined' ? null : localStorage.getItem(STORAGE_KEY);
  return raw === 'bob' ? 'bob' : 'alice';
}

export function useAliceBobIdentity() {
  const [selfName, setSelfNameState] = useState<AliceBobName>(readStored);

  const setSelfName = useCallback((name: AliceBobName) => {
    setSelfNameState(name);
    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, name);
    }
  }, []);

  const otherName: AliceBobName = selfName === 'alice' ? 'bob' : 'alice';

  return { selfName, otherName, setSelfName };
}
