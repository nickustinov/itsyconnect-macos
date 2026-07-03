export {};

declare global {
  interface Window {
    electron?: {
      ready: () => void;
      onNavigate: (cb: (path: string) => void) => () => void;
      getSystemLocale: () => Promise<string>;
      updates: {
        checkNow: () => void;
        installNow: () => void;
        onStatus: (
          cb: (status: { state: string; message?: string; notes?: string[] }) => void,
        ) => () => void;
        getAutoCheck: () => Promise<boolean>;
        setAutoCheck: (enabled: boolean) => void;
      };
    };
  }
}
