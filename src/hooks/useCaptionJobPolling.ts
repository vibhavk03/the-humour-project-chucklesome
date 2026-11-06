'use client';

import { useEffect, useState } from 'react';

/** One request at a time; discard old filters/jobs, retain good data on refresh errors. */
export function useCaptionJobPolling<T>(load: (signal: AbortSignal) => Promise<T>) {
  const [live, setLive] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const [state, setState] = useState<{
    source: typeof load; data?: T; error?: string; loading: boolean; updatedAt?: number;
  }>({ source: load, loading: true });

  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    let controller: AbortController;
    async function poll() {
      controller = new AbortController();
      // Bound a hung request so the dashboard can recover and poll again.
      const timeout = setTimeout(() => controller.abort(), 20000);
      setState(prev => prev.source === load ? { ...prev, loading: true } : { source: load, loading: true });
      try {
        const data = await load(controller.signal);
        if (!stopped) setState({ source: load, data, loading: false, updatedAt: Date.now() });
      } catch (error) {
        if (!stopped) setState(prev => ({ ...prev, loading: false,
          error: controller.signal.aborted ? 'Refresh timed out. Try again.' : error instanceof Error ? error.message : 'Unable to refresh jobs.' }));
      } finally {
        clearTimeout(timeout);
        if (!stopped && live) timer = setTimeout(poll, 5000);
      }
    }
    void poll();
    return () => { stopped = true; controller?.abort(); clearTimeout(timer); };
  }, [load, live, refreshKey]);

  const current = state.source === load ? state : { loading: true, data: undefined, error: undefined, updatedAt: undefined };
  return { ...current, live, setLive, refresh: () => setRefreshKey(value => value + 1) };
}
