import { useState, useCallback, useEffect } from "react";

function readStored(key: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStored(key: string, value: string | null) {
  try {
    if (value === null) {
      localStorage.removeItem(key);
    } else {
      localStorage.setItem(key, value);
    }
  } catch {}
}

export function usePersistedRange(storageKey: string): [string | null, (v: string | null) => void] {
  const [range, setRange] = useState<string | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- client-only localStorage read
    setRange(readStored(storageKey));
  }, [storageKey]);

  const update = useCallback((v: string | null) => {
    setRange(v);
    writeStored(storageKey, v);
  }, [storageKey]);

  return [range, update];
}

export function usePersistedState(storageKey: string, defaultValue: string): [string, (v: string) => void] {
  const [value, setValue] = useState(defaultValue);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- client-only localStorage read
    setValue(readStored(storageKey) ?? defaultValue);
  }, [storageKey, defaultValue]);

  const update = useCallback((v: string) => {
    setValue(v);
    writeStored(storageKey, v);
  }, [storageKey]);

  return [value, update];
}

export function usePersistedBool(storageKey: string, defaultValue: boolean): [boolean, (v: boolean) => void] {
  const [value, setValue] = useState(defaultValue);

  useEffect(() => {
    const stored = readStored(storageKey);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- client-only localStorage read
    setValue(stored !== null ? stored === "1" : defaultValue);
  }, [storageKey, defaultValue]);

  const update = useCallback((v: boolean) => {
    setValue(v);
    writeStored(storageKey, v ? "1" : "0");
  }, [storageKey]);

  return [value, update];
}
