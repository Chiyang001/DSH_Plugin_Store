import { test } from 'node:test';
import assert from 'node:assert/strict';
import { adaptManager, unwrapRemote, type RemoteManager } from '../src/remote';
test('remote adapter unwraps the real Typert result envelope', async () => {
  const remote = { async listBundles() { return { ok: true, value: [{ name: 'host-bundle' }] }; } } as unknown as RemoteManager;
  const manager = adaptManager(remote);
  assert.deepEqual(await manager.listBundles(), [{ name: 'host-bundle' }]);
});
test('remote access refusal is an error instead of an apparent successful operation', async () => {
  const remote = { async removeBundle() { return { ok: false, error: { code: 'forbidden', message: '没有管理权限' } }; } } as unknown as RemoteManager;
  await assert.rejects(adaptManager(remote).removeBundle('demo'), /没有管理权限/);
  assert.throws(() => unwrapRemote(undefined as any), /无法识别/);
});
test('custom registry is forwarded unchanged to inspection and installation', async () => {
  const calls: unknown[] = [];
  const remote = {
    async inspect(spec: string, options: unknown) { calls.push(['inspect', spec, options]); return { ok: true, value: { status: 'accepted', bundle: true } }; },
    async installBundle(spec: string, options: unknown) { calls.push(['install', spec, options]); return { ok: true, value: { changed: true, application: 'applied' } }; },
  } as unknown as RemoteManager;
  const manager = adaptManager(remote);
  const registry = 'https://registry.example.org/';
  await manager.inspect('dsh-private@1.0.0', { registry });
  await manager.installBundle('dsh-private@1.0.0', { registry, enabled: true });
  assert.deepEqual(calls, [['inspect', 'dsh-private@1.0.0', { registry }], ['install', 'dsh-private@1.0.0', { registry, enabled: true }]]);
});
