import { useState, useEffect } from 'react';

/**
 * Drop-in replacement for useState that persists to localStorage.
 * State survives page navigation, tab closure, and browser restart.
 * Use clearSimulationSession() to explicitly wipe stored state.
 */
export function useSessionState<T>(key: string, initialValue: T): [T, React.Dispatch<React.SetStateAction<T>>] {
  const storageKey = `sim_${key}`;

  const [value, setValueRaw] = useState<T>(() => {
    try {
      // Try localStorage first (persistent), fall back to sessionStorage (migration)
      const stored = localStorage.getItem(storageKey) ?? sessionStorage.getItem(storageKey);
      if (stored !== null) {
        const parsed = JSON.parse(stored);
        // Restore Date objects if initialValue is a Date
        if (initialValue instanceof Date && typeof parsed === 'string') {
          const restored = new Date(parsed);
          return (isNaN(restored.getTime()) ? initialValue : restored) as T;
        }
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

  // Sync to localStorage whenever value changes
  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(value));
    } catch {
      // Ignore quota errors
    }
  }, [storageKey, value]);

  return [value, setValueRaw];
}

/**
 * Clears all simulation state keys from both localStorage and sessionStorage.
 */
export function clearSimulationSession(prefix = 'sim_') {
  // Clear localStorage
  const localKeys: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key?.startsWith(prefix)) {
      localKeys.push(key);
    }
  }
  localKeys.forEach(k => localStorage.removeItem(k));

  // Clear legacy sessionStorage keys
  const sessionKeys: string[] = [];
  for (let i = 0; i < sessionStorage.length; i++) {
    const key = sessionStorage.key(i);
    if (key?.startsWith(prefix)) {
      sessionKeys.push(key);
    }
  }
  sessionKeys.forEach(k => sessionStorage.removeItem(k));
}
