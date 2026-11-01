export const mirrorRegistry = 'https://registry.npmmirror.com/';
export const officialRegistry = 'https://registry.npmjs.org/';
export type RegistryMode = 'mirror' | 'official' | 'custom';
export interface RegistrySettings { mode: RegistryMode; customUrl: string }

/** Registry credentials belong in the Host's .npmrc, never in browser settings. */
export function normalizeRegistry(raw: string): string {
  let url: URL;
  try { url = new URL(raw.trim()); } catch { throw new Error('请输入完整的 http:// 或 https:// 安装源地址。'); }
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
    throw new Error('安装源须使用 HTTP 或 HTTPS，且不能包含账号、密码、查询参数或片段。');
  }
  return url.href.replace(/\/*$/, '/');
}
export function registrySettings(value: unknown): RegistrySettings {
  const data = value as Partial<RegistrySettings> | null;
  const fallback: RegistrySettings = { mode: 'mirror', customUrl: '' };
  if (!data || typeof data !== 'object') return fallback;
  let customUrl = '';
  if (typeof data.customUrl === 'string' && data.customUrl.trim()) {
    try { customUrl = normalizeRegistry(data.customUrl); } catch { /* Discard invalid or credential-bearing saved data. */ }
  }
  if (data.mode === 'custom') return customUrl ? { mode: 'custom', customUrl } : fallback;
  return { mode: data.mode === 'official' ? 'official' : 'mirror', customUrl };
}
export function selectedRegistry(settings: RegistrySettings): string {
  return settings.mode === 'custom' ? normalizeRegistry(settings.customUrl) : settings.mode === 'official' ? officialRegistry : mirrorRegistry;
}
/** Explicit index registries may contain private packages unavailable on public mirrors. */
export function installationRegistry(settings: RegistrySettings, explicit?: string): string {
  return explicit ? normalizeRegistry(explicit) : selectedRegistry(settings);
}
