"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
} from "react";
import { useParams } from "next/navigation";
import type { AscVersion } from "@/lib/asc/version-types";
import type { ConnectionError } from "@/lib/apps-context";

interface VersionsContextValue {
  versions: AscVersion[];
  loading: boolean;
  error: ConnectionError | null;
  refresh: () => Promise<void>;
  /** Update a single version in-place without refetching. */
  updateVersion: (versionId: string, updater: (v: AscVersion) => AscVersion) => void;
}

const VersionsContext = createContext<VersionsContextValue>({
  versions: [],
  loading: true,
  error: null,
  refresh: async () => {},
  updateVersion: () => {},
});

export function VersionsProvider({ children }: { children: React.ReactNode }) {
  const { appId } = useParams<{ appId: string }>();
  const [versions, setVersions] = useState<AscVersion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ConnectionError | null>(null);

  // Clear stale data immediately (during render) when appId changes,
  // so consumers never see old-app versions with a new appId.
  const [prevAppId, setPrevAppId] = useState(appId);
  if (appId !== prevAppId) {
    setPrevAppId(appId);
    setVersions([]);
    setLoading(true);
    setError(null);
  }

  const refresh = useCallback(async () => {
    if (!appId) return;
    setLoading(true);

    try {
      const res = await fetch(`/api/apps/${appId}/versions`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError({
          message: typeof data.error === "string" ? data.error : "",
          key: data.error ? undefined : "connectionErrors.loadVersionsFailed",
          category: data.category ?? "api",
        });
        return;
      }

      const data = await res.json();
      setVersions(data.versions ?? []);
      setError(null);
    } catch {
      setError({ message: "", key: "connectionErrors.networkFailed", category: "network" });
    } finally {
      setLoading(false);
    }
  }, [appId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const updateVersion = useCallback(
    (versionId: string, updater: (v: AscVersion) => AscVersion) => {
      setVersions((prev) =>
        prev.map((v) => (v.id === versionId ? updater(v) : v)),
      );
    },
    [],
  );

  return (
    <VersionsContext.Provider value={{ versions, loading, error, refresh, updateVersion }}>
      {children}
    </VersionsContext.Provider>
  );
}

export function useVersions() {
  return useContext(VersionsContext);
}
