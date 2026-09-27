import { useSyncExternalStore } from 'react'

/*
  A one-number store: "how many times has the ledger changed in this session".

  The integrity light in the sidebar is the only thing on screen that outlives a page, and
  a health light that goes stale the moment you post something is worse than no light at
  all. Rather than reach for a state-management library or lift the dashboard's data into a
  context, every successful mutation bumps this counter and the light lists it as a
  dependency. It is deliberately not a cache — it holds no data, only the fact that the
  data changed.
*/

let revision = 0
const listeners = new Set<() => void>()

export function bumpLedgerRevision(): void {
  revision += 1
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function useLedgerRevision(): number {
  return useSyncExternalStore(subscribe, () => revision)
}
