"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

interface RefreshHandler {
  onRefresh: () => Promise<void>;
  busy: boolean;
}

interface RefreshState {
  /** True when the section handler reports busy */
  busy: boolean;
  /** True when a section handler is registered */
  hasHandler: boolean;
  /** Call the section handler's onRefresh (no-op if none registered) */
  doRefresh: () => Promise<void>;
  register: (handler: RefreshHandler) => () => void;
}

const RefreshContext = createContext<RefreshState | null>(null);

export function RefreshProvider({ children }: { children: ReactNode }) {
  const handlerRef = useRef<RefreshHandler | null>(null);
  const [handlerBusy, setHandlerBusy] = useState(false);
  const [hasHandler, setHasHandler] = useState(false);

  // Track handler.busy changes via polling (handler is an external ref)
  useEffect(() => {
    const id = setInterval(() => {
      setHandlerBusy(handlerRef.current?.busy ?? false);
    }, 200);
    return () => clearInterval(id);
  }, []);

  const register = useCallback((handler: RefreshHandler) => {
    handlerRef.current = handler;
    setHasHandler(true);
    setHandlerBusy(handler.busy);
    return () => {
      if (handlerRef.current === handler) {
        handlerRef.current = null;
        setHasHandler(false);
        setHandlerBusy(false);
      }
    };
  }, []);

  const doRefresh = useCallback(async () => {
    if (handlerRef.current) {
      await handlerRef.current.onRefresh();
    }
  }, []);

  return (
    <RefreshContext.Provider value={{ busy: handlerBusy, hasHandler, doRefresh, register }}>
      {children}
    </RefreshContext.Provider>
  );
}

export function useRefresh(): RefreshState {
  const ctx = useContext(RefreshContext);
  if (!ctx) {
    throw new Error("useRefresh must be used within a RefreshProvider");
  }
  return ctx;
}

/** Convenience hook – registers a handler on mount, unregisters on unmount. */
export function useRegisterRefresh(handler: RefreshHandler): void {
  const { register } = useRefresh();
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    // Wrap in a stable object that delegates to the latest ref
    const stableHandler: RefreshHandler = {
      get onRefresh() {
        return handlerRef.current.onRefresh;
      },
      get busy() {
        return handlerRef.current.busy;
      },
    };
    return register(stableHandler);
  }, [register]);
}
