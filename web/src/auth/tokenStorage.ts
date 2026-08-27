const TOKEN_STORAGE_KEY = "stockfolio.authToken";
let memoryToken: string | null = null;

function localStorageOrNull(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function getAuthToken(): string | null {
  try {
    return localStorageOrNull()?.getItem(TOKEN_STORAGE_KEY) ?? memoryToken;
  } catch {
    return memoryToken;
  }
}

export function setAuthToken(token: string): void {
  memoryToken = token;
  try {
    localStorageOrNull()?.setItem(TOKEN_STORAGE_KEY, token);
  } catch {
    // The in-memory fallback keeps the current tab authenticated.
  }
}

export function clearAuthToken(): void {
  memoryToken = null;
  try {
    localStorageOrNull()?.removeItem(TOKEN_STORAGE_KEY);
  } catch {
    // Storage can be unavailable in privacy-restricted browser contexts.
  }
}
