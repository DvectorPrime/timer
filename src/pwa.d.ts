declare module 'virtual:pwa-register' {
  type RegisterSWOptions = {
    onNeedRefresh?: () => void;
    onOfflineReady?: () => void;
  };

  export function registerSW(options?: RegisterSWOptions): () => Promise<void>;
}