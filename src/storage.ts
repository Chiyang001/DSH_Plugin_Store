export function readStorage<T>(key: string, fallback: T): T {
  try { const raw = localStorage.getItem(`chiyang.dsh-store.${key}`); return raw ? JSON.parse(raw) : fallback; } catch { return fallback; }
}
export function writeStorage(key: string, value: unknown): boolean {
  try { localStorage.setItem(`chiyang.dsh-store.${key}`, JSON.stringify(value)); return true; } catch { return false; }
}
