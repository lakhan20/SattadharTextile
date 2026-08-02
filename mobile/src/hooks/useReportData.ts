import { useCallback, useEffect, useState } from 'react';
import { useApiError, type ReadableError } from './useApiError';

interface ReportState<T> {
  data: T | null;
  loading: boolean;
  refreshing: boolean;
  failure: ReadableError | null;
  reload: () => void;
}

/**
 * The fetch lifecycle every report screen repeats: load, show a spinner the
 * first time, show a pull-to-refresh spinner afterwards, and surface a
 * readable failure.
 *
 * `fetcher` must be memoised by the caller (it carries the date range), and it
 * is the dependency this hook re-runs on — so changing the range refetches
 * with no extra effect and no risk of the two falling out of step.
 *
 * A response that arrives after the range changed again is dropped rather than
 * rendered: without that, tapping "Today" then "This month" quickly can leave
 * the slower first request painting stale figures under the new heading.
 */
export function useReportData<T>(fetcher: () => Promise<T>): ReportState<T> {
  const readError = useApiError();
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [failure, setFailure] = useState<ReadableError | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let cancelled = false;

    // Only the very first load blanks the screen; a range change keeps the
    // previous figures on screen until the new ones arrive.
    setLoading((previous) => previous || data === null);
    setFailure(null);

    fetcher()
      .then((result) => {
        if (cancelled) return;
        setData(result);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setFailure(readError(error));
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
        setRefreshing(false);
      });

    return () => {
      cancelled = true;
    };
    // `data` is deliberately not a dependency — it is read only to decide
    // whether this is a first load, and including it would loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetcher, readError, reloadToken]);

  const reload = useCallback(() => {
    setRefreshing(true);
    setReloadToken((token) => token + 1);
  }, []);

  return { data, loading: loading && data === null, refreshing, failure, reload };
}
