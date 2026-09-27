import { useCallback, useEffect, useState, type DependencyList } from 'react'

import { ApiError } from '@/api/client'

/*
  A deliberately small data-fetching hook instead of TanStack Query.

  The app has seven pages and no client-side cache requirements worth the dependency: each
  page reads what it needs, and re-reads after a mutation. What it *does* need is the three
  states every screen must handle — loading, failed, loaded — in one place, so that no page
  can forget one. Named as a trade-off: a larger app would want real caching, deduplication
  and background refetching, and re-implementing those here would be the wrong instinct.
*/

export interface ApiState<T> {
  /** The most recent successful result. Kept while a new request is in flight, so changing a
   *  filter dims the existing table rather than blanking the page. */
  data: T | null
  error: ApiError | null
  loading: boolean
  /** Re-run the fetch — called after a mutation changes the underlying data. */
  reload: () => void
}

function asApiError(caught: unknown): ApiError {
  return caught instanceof ApiError ? caught : new ApiError('Unexpected error.', 0)
}

export function useApi<T>(fetcher: () => Promise<T>, deps: DependencyList): ApiState<T> {
  const [nonce, setNonce] = useState(0)

  // One string identifying the request the caller is currently asking for. Loading is then
  // *derived* — "the result I hold is not the result I want" — rather than being a third
  // piece of state that has to be flipped on and off in the effect and kept consistent.
  const requestKey = JSON.stringify([...deps, nonce])

  const [result, setResult] = useState<{
    key: string | null
    data: T | null
    error: ApiError | null
  }>({ key: null, data: null, error: null })

  useEffect(() => {
    let cancelled = false

    fetcher()
      .then((data) => {
        if (!cancelled) setResult({ key: requestKey, data, error: null })
      })
      .catch((caught: unknown) => {
        if (!cancelled) setResult({ key: requestKey, data: null, error: asApiError(caught) })
      })

    // A stale response must not overwrite a newer one: the journal and statement pages fire
    // a fresh request every time a filter changes, and they do not come back in order.
    return () => {
      cancelled = true
    }
    // `fetcher` is intentionally not a dependency — it is a new closure on every render, and
    // `requestKey` already names everything the request actually depends on.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestKey])

  const reload = useCallback(() => setNonce((value) => value + 1), [])

  return {
    data: result.data,
    error: result.key === requestKey ? result.error : null,
    loading: result.key !== requestKey,
    reload,
  }
}
