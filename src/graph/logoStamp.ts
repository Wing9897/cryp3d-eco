const STORAGE_KEY = 'sol-logo-stamp';

function readStoredStamp(): number {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    const value = raw ? Number(raw) : 0;
    return Number.isInteger(value) && value > 0 ? value : 0;
  } catch {
    return 0;
  }
}

let stamp = readStoredStamp();
const listeners = new Set<() => void>();

export function getLogoStamp(): number {
  return stamp;
}

export function subscribeLogoStamp(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function bumpLogoStamp(): number {
  stamp += 1;
  try {
    sessionStorage.setItem(STORAGE_KEY, String(stamp));
  } catch {
    // This tab still uses the new stamp when storage is unavailable.
  }
  for (const listener of listeners) listener();
  return stamp;
}
