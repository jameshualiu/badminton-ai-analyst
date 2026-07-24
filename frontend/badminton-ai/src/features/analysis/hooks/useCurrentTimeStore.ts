import { useState } from "react";

export interface CurrentTimeStore {
  get: () => number;
  set: (t: number) => void;
  subscribe: (cb: () => void) => () => void;
}

function createCurrentTimeStore(initial: number): CurrentTimeStore {
  let value = initial;
  const listeners = new Set<() => void>();
  return {
    get: () => value,
    set: (t) => {
      if (t === value) return;
      value = t;
      listeners.forEach((cb) => cb());
    },
    subscribe: (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
  };
}

// Stable per-mount store for high-frequency (rAF-driven) currentTime updates.
// Components that need to react to every tick subscribe via useSyncExternalStore
// instead of the value living in AnalysisPage's own state, so playback doesn't
// re-render the whole page tree 60x/sec.
export function useCurrentTimeStore(initial = 0): CurrentTimeStore {
  const [store] = useState(() => createCurrentTimeStore(initial));
  return store;
}
