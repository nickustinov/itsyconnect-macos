"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
} from "react";
import { useParams } from "next/navigation";
import type { PreReleaseVersion } from "@/lib/asc/version-types";

interface PreReleaseVersionsContextValue {
  versions: PreReleaseVersion[];
  loading: boolean;
  refresh: () => Promise<void>;
}

const PreReleaseVersionsContext = createContext<PreReleaseVersionsContextValue>({
  versions: [],
  loading: true,
  refresh: async () => {},
});

export function PreReleaseVersionsProvider({ children }: { children: React.ReactNode }) {
  const { appId } = useParams<{ appId: string }>();
  const [versions, setVersions] = useState<PreReleaseVersion[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!appId) return;
    setLoading(true);

    try {
      const res = await fetch(`/api/apps/${appId}/testflight/pre-release-versions`);
      if (res.ok) {
        const data = await res.json();
        setVersions(data.versions ?? []);
      }
    } catch {
      // Best-effort – TestFlight pages will show empty picker
    } finally {
      setLoading(false);
    }
  }, [appId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return (
    <PreReleaseVersionsContext.Provider value={{ versions, loading, refresh }}>
      {children}
    </PreReleaseVersionsContext.Provider>
  );
}

export function usePreReleaseVersions() {
  return useContext(PreReleaseVersionsContext);
}
