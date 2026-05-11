import { useState, useEffect, useCallback, useRef } from 'react';
import type { AppEvent } from '../types';
import { api } from '../services/api';

const MAX_EVENTS = 50;

export function useEventStream(onEvent?: (event: AppEvent) => void) {
  const [events, setEvents] = useState<AppEvent[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  useEffect(() => {
    const es = new EventSource(api.getEventsUrl());

    es.onopen = () => setIsConnected(true);

    es.onmessage = (msg) => {
      try {
        const event: AppEvent = JSON.parse(msg.data);
        if (event.type === 'connected') {
          setIsConnected(true);
          return;
        }
        setEvents((prev) => [event, ...prev].slice(0, MAX_EVENTS));
        onEventRef.current?.(event);
      } catch { /* ignore malformed */ }
    };

    es.onerror = () => setIsConnected(false);

    return () => es.close();
  }, []);

  const clearEvents = useCallback(() => setEvents([]), []);

  return { events, isConnected, clearEvents };
}
