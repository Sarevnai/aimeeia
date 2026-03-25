import { useState, useEffect, useCallback } from 'react';

/**
 * Drop-in replacement for useState that persists to sessionStorage.
 * State survives page navigation within the same tab/session.
 * Cleared when the browser tab is closed.
 */
export function useSessionState<T>(key: string, initialValue: T): [T, React.Dispatch<React.SetStateAction<T>>] {
  const storageKey = `sim_${key}`;

  const [value, setValueRaw] = useState<T>(() => {
    try {
      const stored = sessionStorage.getItem(storageKey);
      if (stored !== null) {
        const parsed = JSON.parse(stored);
        // Restore Date objects in messages array
        if (Array.isArray(parsed)) {
          return parsed.map((item: any) => {
            if (item?.timestamp) {
              return { ...item, timestamp: new Date(item.timestamp) };
            }
            return item;
          }) as T;
        }
        return parsed;
      }
    } catch {
      // Ignore parse errors
    }
    return initialValue;
  });

  // Sync to sessionStorage whenever value changes
  useEffect(() => {
    try {
      sessionStorage.setItem(storageKey, JSON.stringify(value));
    } catch {
      // Ignore quota errors
    }
  }, [storageKey, value]);

  return [value, setValueRaw];
}

/**
 * Clears all simulation session state keys.
 */
export function clearSimulationSession(prefix = 'sim_') {
  const keysToRemove: string[] = [];
  for (let i = 0; i < sessionStorage.length; i++) {
    const key = sessionStorage.key(i);
    if (key?.startsWith(prefix)) {
      keysToRemove.push(key);
    }
  }
  keysToRemove.forEach(k => sessionStorage.removeItem(k));
}
