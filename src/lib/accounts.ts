import { useSyncExternalStore } from "react";

export interface Account {
  id: string;
  email: string;
  name: string;
  salt: string;
  hash: string;
  createdAt: string;
}

const ACCOUNTS_KEY = "six-accounts-v1";
const SESSION_KEY = "six-session";
const EVENT = "six-session";

function readAccounts(): Account[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(ACCOUNTS_KEY);
    const parsed = raw ? (JSON.parse(raw) as Account[]) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeAccounts(accounts: Account[]) {
  localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(accounts));
}

export function readSessionId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem(SESSION_KEY);
  } catch {
    return null;
  }
}

let snapshotToken = "";
let snapshotAccount: Account | null = null;

function readSnapshot(): Account | null {
  if (typeof window === "undefined") return null;
  const id = localStorage.getItem(SESSION_KEY);
  const raw = localStorage.getItem(ACCOUNTS_KEY) ?? "";
  const token = `${id ?? ""}|${raw}`;
  if (token === snapshotToken) return snapshotAccount;
  snapshotToken = token;
  if (!id) {
    snapshotAccount = null;
    return null;
  }
  try {
    const accounts = JSON.parse(raw) as Account[];
    snapshotAccount = Array.isArray(accounts) ? (accounts.find((account) => account.id === id) ?? null) : null;
  } catch {
    snapshotAccount = null;
  }
  return snapshotAccount;
}

function emit() {
  window.dispatchEvent(new Event(EVENT));
}

function subscribe(onStoreChange: () => void) {
  window.addEventListener(EVENT, onStoreChange);
  window.addEventListener("storage", onStoreChange);
  return () => {
    window.removeEventListener(EVENT, onStoreChange);
    window.removeEventListener("storage", onStoreChange);
  };
}

export function useSession(): Account | null {
  return useSyncExternalStore(subscribe, readSnapshot, () => null);
}

function bytesToB64(bytes: Uint8Array): string {
  let text = "";
  for (const byte of bytes) text += String.fromCharCode(byte);
  return btoa(text);
}

async function digest(password: string, saltB64: string): Promise<string> {
  const salt = Uint8Array.from(atob(saltB64), (char) => char.charCodeAt(0));
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, [
    "deriveBits",
  ]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations: 120_000, hash: "SHA-256" },
    key,
    256,
  );
  return bytesToB64(new Uint8Array(bits));
}

export async function createAccount(email: string, password: string, name: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const clean = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean)) return { ok: false, error: "Enter a real email. It is your sign-in name on this device." };
  if (password.length < 8) return { ok: false, error: "Use at least 8 characters." };
  const accounts = readAccounts();
  if (accounts.some((account) => account.email === clean)) return { ok: false, error: "That email already has a journal on this device." };
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const saltB64 = bytesToB64(salt);
  const account: Account = {
    id: crypto.randomUUID(),
    email: clean,
    name: name.trim() || clean.split("@")[0] || "Trader",
    salt: saltB64,
    hash: await digest(password, saltB64),
    createdAt: new Date().toISOString(),
  };
  writeAccounts([...accounts, account]);
  localStorage.setItem(SESSION_KEY, account.id);
  emit();
  return { ok: true };
}

export async function signIn(email: string, password: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const clean = email.trim().toLowerCase();
  const account = readAccounts().find((item) => item.email === clean);
  if (!account) return { ok: false, error: "No journal on this device uses that email." };
  const hash = await digest(password, account.salt);
  if (hash !== account.hash) return { ok: false, error: "Wrong password." };
  localStorage.setItem(SESSION_KEY, account.id);
  emit();
  return { ok: true };
}

export function signOut() {
  localStorage.removeItem(SESSION_KEY);
  emit();
}
