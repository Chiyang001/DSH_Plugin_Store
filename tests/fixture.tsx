import { createRoot } from 'react-dom/client';
import { App } from '../src/App';
import type { Bridge, Bundle, ChangeResult } from '../src/types';
import '../src/styles.css';
import '../src/paper.css';
const calls: unknown[] = []; (window as any).__storeCalls = calls;
const bundles: Bundle[] = [
  { name: 'dsh-test-tools', official: false, installed: true, enabled: true, availability: 'profile', optional: false, removable: true, updatable: true, version: '1.0.0', rows: [], meta: { title: '测试开发工具', description: '验证真实管理流程的测试夹具 priority-fixture-001' } },
  { name: '@deepseek-ai/dsh-voice-test', official: true, installed: false, enabled: false, availability: 'installation', optional: true, removable: false, updatable: false, version: '0.2.1', rows: [], meta: { title: '测试语音输入', description: '内置能力测试夹具 priority-fixture-001' } },
];
const result = (): ChangeResult => ({ changed: true, application: 'restart-required' });
const bridge: Bridge = { mode: 'harness', manager: {
  async listBundles() { return structuredClone(bundles); },
  async inspect(spec, options) { calls.push(['inspect', spec, options]); return { status: 'accepted', bundle: true }; },
  async installBundle(spec, options) { calls.push(['install', spec, options]); return result(); },
  async setBundleEnabled(name, enabled) { calls.push(['toggle', name, enabled]); bundles.find(b => b.name === name)!.enabled = enabled; return result(); },
  async removeBundle(name) { calls.push(['remove', name]); return { changed: false, application: 'failed', error: { code: 'test', reason: '卸载被测试宿主拒绝' } }; },
  async listVersions(name) { calls.push(['versions', name]); return { status: 'listed', registry: 'https://registry.npmjs.org/', versions: [{ version: '1.1.0', prerelease: false, bundle: true }] }; },
  async updateBundle(name, version) { calls.push(['update', name, version]); return { result: result() }; },
} };
createRoot(document.getElementById('root')!).render(<App bridge={bridge}/>);
