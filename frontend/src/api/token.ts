/**
 * Where the bearer token lives.
 *
 * Deliberately outside React: the HTTP client needs the token on every request and is not a
 * component. The auth context is the only thing that writes here; everything else reads.
 *
 * localStorage, not memory, so a refresh does not sign you out. That is a real trade-off — a token
 * in localStorage is readable by any script that ends up on the page — and it is the conventional
 * choice for a SPA with no backend of its own to set an httpOnly cookie.
 */
const STORAGE_KEY = "kanbunny.token";

type Listener = (token: string | null) => void;

const listeners = new Set<Listener>();

let current: string | null = readFromStorage();

function readFromStorage(): string | null {
  // Private windows and blocked site data both throw rather than returning null.
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function getToken(): string | null {
  return current;
}

export function setToken(token: string | null): void {
  current = token;
  try {
    if (token) localStorage.setItem(STORAGE_KEY, token);
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // A token held only in memory still works for this tab; it just will not survive a refresh.
  }
  for (const listener of listeners) listener(token);
}

export function subscribeToToken(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
