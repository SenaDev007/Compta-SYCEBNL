import type { Workspace } from "@/lib/accounting/types";
import { validateWorkspace } from "@/lib/accounting/validation";

const DB_NAME = "compta-sycebnl-vault";
const DB_VERSION = 1;
const STORE_NAME = "profiles";
const KDF_ITERATIONS = 310_000;
const encoder = new TextEncoder();

type VaultRecord = {
  email: string;
  userId: string;
  salt: number[];
  iv: number[];
  ciphertext: string;
  version: number;
  dirty: boolean;
  requiresConflict: boolean;
  updatedAt: string;
};

export type OfflineCipher = { key: CryptoKey; salt: Uint8Array };
export type OfflineUser = { id: string; email: string };
export type OfflineLoginResult =
  | { status: "missing" | "invalid" }
  | {
      status: "ok";
      user: OfflineUser;
      workspace: Workspace;
      version: number;
      dirty: boolean;
      requiresConflict: boolean;
      cipher: OfflineCipher;
    };

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function openVault(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined" || !globalThis.crypto?.subtle) {
    return Promise.reject(new Error("offline_storage_unavailable"));
  }
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME, { keyPath: "email" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("offline_storage_unavailable"));
    request.onblocked = () => reject(new Error("offline_storage_unavailable"));
  });
}

async function readRecord(email: string): Promise<VaultRecord | null> {
  const database = await openVault();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readonly");
    const request = transaction.objectStore(STORE_NAME).get(normalizeEmail(email));
    request.onsuccess = () => resolve((request.result as VaultRecord | undefined) ?? null);
    request.onerror = () => reject(request.error ?? new Error("offline_storage_unavailable"));
    transaction.oncomplete = () => database.close();
    transaction.onerror = () => {
      database.close();
      reject(transaction.error ?? new Error("offline_storage_unavailable"));
    };
    transaction.onabort = () => {
      database.close();
      reject(transaction.error ?? new Error("offline_storage_unavailable"));
    };
  });
}

async function writeRecord(record: VaultRecord): Promise<void> {
  const database = await openVault();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).put(record);
    transaction.oncomplete = () => {
      database.close();
      resolve();
    };
    transaction.onerror = () => {
      database.close();
      reject(transaction.error ?? new Error("offline_storage_unavailable"));
    };
    transaction.onabort = () => {
      database.close();
      reject(transaction.error ?? new Error("offline_storage_unavailable"));
    };
  });
}

export async function hasOfflineAccount(email: string): Promise<boolean> {
  try {
    return Boolean(await readRecord(email));
  } catch {
    return false;
  }
}

function toBase64(bytes: Uint8Array) {
  let result = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    result += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(result);
}

function fromBase64(value: string) {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function deriveCipher(password: string, salt: Uint8Array): Promise<OfflineCipher> {
  if (!globalThis.crypto?.subtle) throw new Error("offline_crypto_unavailable");
  const safeSalt = new Uint8Array(new ArrayBuffer(salt.byteLength));
  safeSalt.set(salt);
  const material = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, [
    "deriveKey",
  ]);
  const key = await crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: safeSalt, iterations: KDF_ITERATIONS, hash: "SHA-256" },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
  return { key, salt: safeSalt };
}

export async function createOfflineCipher(password: string): Promise<OfflineCipher> {
  const salt = new Uint8Array(new ArrayBuffer(16));
  crypto.getRandomValues(salt);
  return deriveCipher(password, salt);
}

function additionalData(email: string, userId: string) {
  return encoder.encode(`compta-sycebnl:v1:${normalizeEmail(email)}:${userId}`);
}

export async function saveOfflineWorkspace(
  user: OfflineUser,
  workspace: Workspace,
  version: number,
  dirty: boolean,
  cipher: OfflineCipher,
  requiresConflict = false,
): Promise<void> {
  const checked = validateWorkspace(workspace);
  if (!checked.success || !Number.isSafeInteger(version) || version < 0) {
    throw new Error("offline_snapshot_invalid");
  }
  const email = normalizeEmail(user.email);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cleartext = encoder.encode(
    JSON.stringify({ workspace: checked.data, version, dirty, requiresConflict }),
  );
  const sealed = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: additionalData(email, user.id) },
    cipher.key,
    cleartext,
  );
  const ciphertext = new Uint8Array(sealed);
  await writeRecord({
    email,
    userId: user.id,
    salt: Array.from(cipher.salt),
    iv: Array.from(iv),
    ciphertext: toBase64(ciphertext),
    version,
    dirty,
    requiresConflict,
    updatedAt: new Date().toISOString(),
  });
}

export async function openOfflineAccount(
  emailInput: string,
  password: string,
): Promise<OfflineLoginResult> {
  const email = normalizeEmail(emailInput);
  let record: VaultRecord | null;
  try {
    record = await readRecord(email);
  } catch {
    return { status: "missing" };
  }
  if (!record) return { status: "missing" };
  try {
    const salt = Uint8Array.from(record.salt);
    const cipher = await deriveCipher(password, salt);
    const cleartext = await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: Uint8Array.from(record.iv),
        additionalData: additionalData(record.email, record.userId),
      },
      cipher.key,
      fromBase64(record.ciphertext),
    );
    const snapshot = JSON.parse(new TextDecoder().decode(cleartext)) as {
      workspace: unknown;
      version: number;
      dirty: boolean;
      requiresConflict?: boolean;
    };
    const checked = validateWorkspace(snapshot.workspace);
    if (
      !checked.success ||
      !Number.isSafeInteger(snapshot.version) ||
      snapshot.version < 0 ||
      typeof snapshot.dirty !== "boolean" ||
      (snapshot.requiresConflict !== undefined && typeof snapshot.requiresConflict !== "boolean")
    ) {
      return { status: "invalid" };
    }
    return {
      status: "ok",
      user: { id: record.userId, email: record.email },
      workspace: checked.data,
      version: snapshot.version,
      dirty: snapshot.dirty,
      requiresConflict: snapshot.requiresConflict ?? false,
      cipher,
    };
  } catch {
    return { status: "invalid" };
  }
}
