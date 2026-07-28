import { Capacitor } from '@capacitor/core';

// We keep the original key name (`micopay_users`) so legacy sync readers in
// the codebase (e.g. TradeDetail.getToken on web) continue to work unchanged.
// On native, the SecureStorage plugin namespaces values per-app already.

interface KvStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
}

const webStore: KvStore = {
  async get(key) {
    return window.localStorage.getItem(key);
  },
  async set(key, value) {
    window.localStorage.setItem(key, value);
  },
  async remove(key) {
    window.localStorage.removeItem(key);
  },
};

let nativeStorePromise: Promise<KvStore> | null = null;

async function getStore(): Promise<KvStore> {
  if (!Capacitor.isNativePlatform()) return webStore;
  if (!nativeStorePromise) {
    nativeStorePromise = import('@aparajita/capacitor-secure-storage').then(({ SecureStorage }) => ({
      async get(key) {
        const v = await SecureStorage.get(key);
        return typeof v === 'string' ? v : null;
      },
      async set(key, value) {
        await SecureStorage.set(key, value);
      },
      async remove(key) {
        await SecureStorage.remove(key);
      },
    }));
  }
  return nativeStorePromise;
}

export async function readJSON<T>(key: string): Promise<T | null> {
  const store = await getStore();
  const raw = await store.get(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export async function writeJSON(key: string, value: unknown): Promise<void> {
  const store = await getStore();
  await store.set(key, JSON.stringify(value));
}

export async function removeKey(key: string): Promise<void> {
  const store = await getStore();
  await store.remove(key);
}

const BACKUP_CONFIRMED_KEY = 'backup_confirmed';

export async function setBackupConfirmed(): Promise<void> {
  await writeJSON(BACKUP_CONFIRMED_KEY, true);
}

export async function isBackupConfirmed(): Promise<boolean> {
  const confirmed = await readJSON<boolean>(BACKUP_CONFIRMED_KEY);
  return !!confirmed;
}
