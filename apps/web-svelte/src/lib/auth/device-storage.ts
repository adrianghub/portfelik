import { Capacitor, registerPlugin } from "@capacitor/core";

interface AuthVault {
  read(): Promise<{ items: Record<string, string> }>;
  write(input: { items: Record<string, string> }): Promise<void>;
}

const vault = registerPlugin<AuthVault>("AuthVault");
const native = () => Capacitor.isNativePlatform();
const authKey = (key: string) => key.startsWith("jakstoimy.auth.") || /^sb-.*-auth-token/.test(key);
let items: Record<string, string> = {};
let initialized = false;
let initialization: Promise<void> | undefined;
let pending = Promise.resolve();

/** Android tokens are encrypted by Keystore, never persisted in WebView storage. */
export function initializeDeviceAuthStorage(): Promise<void> {
  if (!native()) return Promise.resolve();
  return (initialization ??= (async () => {
    const stored = (await vault.read()).items;
    if (
      !stored ||
      Object.entries(stored).some(([key, value]) => !authKey(key) || typeof value !== "string")
    ) {
      throw new Error("invalid_auth_vault");
    }
    const legacy = Object.keys(localStorage).filter(authKey);
    // Upgrade existing installations once. Remove plaintext only after encrypted write succeeds.
    items = { ...stored };
    if (Object.keys(items).length === 0 && legacy.length > 0) {
      items = Object.fromEntries(legacy.map((key) => [key, localStorage.getItem(key)!]));
      await vault.write({ items });
    }
    for (const key of legacy) localStorage.removeItem(key);
    initialized = true;
  })());
}

function ready(): void {
  if (native() && !initialized) throw new Error("auth_vault_not_ready");
}

function persist(): void {
  const snapshot = { ...items };
  pending = pending.then(() => vault.write({ items: snapshot }));
  // Keep the failure latched for flush/read; avoid an unhandled background rejection.
  void pending.catch(() => {});
}

export const deviceAuthStorage = {
  getItem(key: string): string | null {
    ready();
    return native()
      ? (items[key] ?? null)
      : typeof localStorage === "undefined"
        ? null
        : localStorage.getItem(key);
  },
  setItem(key: string, value: string): void {
    ready();
    if (!native()) {
      localStorage.setItem(key, value);
      return;
    }
    if (!authKey(key)) throw new Error("invalid_auth_key");
    items[key] = value;
    persist();
  },
  removeItem(key: string): void {
    ready();
    if (!native()) {
      localStorage.removeItem(key);
      return;
    }
    delete items[key];
    persist();
  },
  keys(): string[] {
    ready();
    if (native()) return Object.keys(items);
    if (typeof localStorage === "undefined") return [];
    return Array.from({ length: localStorage.length }, (_, i) => localStorage.key(i)).filter(
      (key): key is string => !!key
    );
  },
};

export async function flushDeviceAuthStorage(): Promise<void> {
  await initializeDeviceAuthStorage();
  await pending;
}

/** Supabase's async adapter waits for the native vault before restoring Auth. */
export const supabaseAuthStorage = {
  async getItem(key: string) {
    await flushDeviceAuthStorage();
    return deviceAuthStorage.getItem(key);
  },
  async setItem(key: string, value: string) {
    await initializeDeviceAuthStorage();
    deviceAuthStorage.setItem(key, value);
    await flushDeviceAuthStorage();
  },
  async removeItem(key: string) {
    await initializeDeviceAuthStorage();
    deviceAuthStorage.removeItem(key);
    await flushDeviceAuthStorage();
  },
};
