import { useState, useCallback } from 'react';

export interface AsyncResult {
  type: 'success' | 'error';
  message: string;
}

export function useAsyncAction() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AsyncResult | null>(null);

  const execute = useCallback(async (fn: (setMessage: (msg: string) => void) => Promise<void>) => {
    setLoading(true);
    setResult(null);
    const setMessage = (msg: string) => setResult({ type: 'success', message: msg });
    try {
      await fn(setMessage);
    } catch (e: any) {
      setResult({ type: 'error', message: e.message || 'Operation failed' });
    } finally {
      setLoading(false);
    }
  }, []);

  const clearResult = useCallback(() => setResult(null), []);

  return { loading, result, execute, clearResult };
}
