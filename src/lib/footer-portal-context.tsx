"use client";

import { createContext, useContext, useState, useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";

const FooterPortalContext = createContext<HTMLDivElement | null>(null);

export function FooterPortalProvider({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [target, setTarget] = useState<HTMLDivElement | null>(null);

  useEffect(() => {
    setTarget(ref.current);
  }, []);

  return (
    <FooterPortalContext.Provider value={target}>
      {children}
      <div ref={ref} />
    </FooterPortalContext.Provider>
  );
}

export function FooterPortal({ children }: { children: ReactNode }) {
  const target = useContext(FooterPortalContext);
  if (!target) return null;
  return createPortal(children, target);
}
