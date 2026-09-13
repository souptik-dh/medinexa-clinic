// Encrypts PII (name/email/phone/address, etc.) before it touches
// localStorage, so a raw dump of browser storage - devtools, a shared
// support-session screen share, a disk-level backup - doesn't hand over
// plaintext patient/clinic data. The AES-GCM key itself lives only in
// IndexedDB as a non-extractable CryptoKey: it can be *used* by this origin's
// script but its raw bytes can never be read out, even by that same script.
// This is defense-in-depth, not a defense against an attacker who can already
// run arbitrary JS on the page (they could just call the same decrypt
// function this module exposes) - that threat requires fixing XSS, not
// storage encryption.

const DB_NAME = "medinexa-secure";
const DB_VERSION = 1;
const KEY_STORE = "keys";
const KEY_ID = "pii-aes-key";

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(KEY_STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

let keyPromise: Promise<CryptoKey> | null = null;

async function getOrCreateKey(): Promise<CryptoKey> {
  if (keyPromise) return keyPromise;
  keyPromise = (async () => {
    const db = await openDb();
    const existing = await new Promise<CryptoKey | undefined>((resolve, reject) => {
      const tx = db.transaction(KEY_STORE, "readonly");
      const req = tx.objectStore(KEY_STORE).get(KEY_ID);
      req.onsuccess = () => resolve(req.result as CryptoKey | undefined);
      req.onerror = () => reject(req.error);
    });
    if (existing) return existing;

    const key = await crypto.subtle.generateKey(
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"]
    );
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(KEY_STORE, "readwrite");
      tx.objectStore(KEY_STORE).put(key, KEY_ID);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    return key;
  })();
  return keyPromise;
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function fromBase64(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** Encrypts `value` and writes it to `storageKey` in localStorage. Pass `null`/`undefined` to remove the entry instead. */
export async function setSecureItem(storageKey: string, value: unknown): Promise<void> {
  if (typeof window === "undefined") return;
  if (value === null || value === undefined) {
    window.localStorage.removeItem(storageKey);
    return;
  }
  const key = await getOrCreateKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plaintext = new TextEncoder().encode(JSON.stringify(value));
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plaintext);
  window.localStorage.setItem(
    storageKey,
    `${toBase64(iv)}:${toBase64(new Uint8Array(ciphertext))}`
  );
}

/** Reads and decrypts `storageKey` from localStorage. Returns null if absent or if it fails to decrypt (e.g. a stale plaintext value from before encryption was added, or a different browser profile's data). */
export async function getSecureItem<T>(storageKey: string): Promise<T | null> {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(storageKey);
  if (!raw) return null;
  try {
    const sep = raw.indexOf(":");
    if (sep < 0) throw new Error("malformed payload");
    const iv = fromBase64(raw.slice(0, sep));
    const data = fromBase64(raw.slice(sep + 1));
    const key = await getOrCreateKey();
    const plaintext = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: iv as unknown as BufferSource },
      key,
      data as unknown as BufferSource
    );
    return JSON.parse(new TextDecoder().decode(plaintext)) as T;
  } catch {
    window.localStorage.removeItem(storageKey);
    return null;
  }
}

export function removeSecureItem(storageKey: string): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(storageKey);
}
