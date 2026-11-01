import type { Manager } from './types';
export type RemoteResult<T> = { ok: true; value: T } | { ok: false; error: { message?: string; code?: string; details?: unknown } };
export type RemoteManager = { [K in keyof Manager]: (...args: Parameters<Manager[K]>) => Promise<RemoteResult<Awaited<ReturnType<Manager[K]>>>> };
export function unwrapRemote<T>(result: RemoteResult<T>): T {
  if (!result || typeof result.ok !== 'boolean') throw new Error('Harness 返回了无法识别的远程响应。');
  if (!result.ok) throw new Error(result.error?.message || result.error?.code || 'Harness 拒绝了此次操作。');
  return result.value;
}
export function adaptManager(remote: RemoteManager): Manager {
  return {
    listBundles: async () => unwrapRemote(await remote.listBundles()),
    inspect: async (spec, options) => unwrapRemote(await remote.inspect(spec, options)),
    installBundle: async (spec, options) => unwrapRemote(await remote.installBundle(spec, options)),
    setBundleEnabled: async (name, enabled) => unwrapRemote(await remote.setBundleEnabled(name, enabled)),
    removeBundle: async name => unwrapRemote(await remote.removeBundle(name)),
    listVersions: async name => unwrapRemote(await remote.listVersions(name)),
    updateBundle: async (name, version, options) => unwrapRemote(await remote.updateBundle(name, version, options)),
  };
}
