import { useEffect, useState } from 'react';
import { fetchRunBundle, fetchRuns, type RunBundle } from './api';

export interface RunStatus {
  loading: boolean;
  error: string | null;
  runs: string[];
  runId: string | null;
  bundle: RunBundle | null;
  selectRun: (id: string) => void;
  refresh: () => void;
}

export function useLatestRun(): RunStatus {
  const [runs, setRuns] = useState<string[]>([]);
  const [runId, setRunId] = useState<string | null>(null);
  const [bundle, setBundle] = useState<RunBundle | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const list = await fetchRuns();
        if (cancelled) return;
        setRuns(list);
        const target = runId ?? (list.length > 0 ? list[list.length - 1] ?? null : null);
        if (target !== runId) setRunId(target);
        if (!target) {
          setBundle(null);
          setLoading(false);
          return;
        }
        const b = await fetchRunBundle(target);
        if (cancelled) return;
        setBundle(b);
        setError(null);
      } catch (err) {
        if (!cancelled) setError((err as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [runId, tick]);

  return {
    loading,
    error,
    runs,
    runId,
    bundle,
    selectRun: setRunId,
    refresh: () => setTick((t) => t + 1),
  };
}
