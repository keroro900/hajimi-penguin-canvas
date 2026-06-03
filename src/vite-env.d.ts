/// <reference types="vite/client" />

type T8UpdaterStatusCode =
  | 'idle'
  | 'disabled'
  | 'checking'
  | 'not-available'
  | 'available'
  | 'downloading'
  | 'downloaded'
  | 'installing'
  | 'error';

interface T8UpdaterProgress {
  percent: number;
  transferred: number;
  total: number;
  bytesPerSecond: number;
}

interface T8UpdaterStatus {
  status: T8UpdaterStatusCode;
  currentVersion: string;
  availableVersion?: string | null;
  message?: string | null;
  progress?: T8UpdaterProgress | null;
  downloaded?: boolean;
  error?: string | null;
  packaged?: boolean;
  updatedAt?: string | null;
}

interface T8UpdaterResult {
  success: boolean;
  message?: string;
  info?: unknown;
  status?: T8UpdaterStatus;
}

interface Window {
  t8pc?: {
    getInfo: () => Promise<{
      packaged: boolean;
      backendPort: number;
      userData: string;
      version: string;
      updater?: T8UpdaterStatus;
    }>;
    openExternal: (url: string) => Promise<{ success: boolean; message?: string }>;
    updater?: {
      getStatus: () => Promise<T8UpdaterStatus>;
      check: () => Promise<T8UpdaterResult>;
      download: () => Promise<T8UpdaterResult>;
      install: () => Promise<T8UpdaterResult>;
      onStatus: (callback: (status: T8UpdaterStatus) => void) => () => void;
    };
  };
}
