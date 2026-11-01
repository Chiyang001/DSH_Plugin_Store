import { App } from './App';
import { Icon } from './icons';
import type { Bridge } from './types';
import { adaptManager, type RemoteManager } from './remote';
import css from './styles.css';
import paperCss from './paper.css';

// Only the small public runtime face is needed; no Host module is bundled in the browser.
export interface HarnessContext {
  remote: { pluginManager: RemoteManager; $on(event: string, callback: (data: unknown) => void): () => void };
  slots: { inject(name: string, factory: () => unknown): unknown; register(options: Record<string, unknown>, component: any): unknown };
  remoteAccess: { whenAccess?(permission: string, factory: () => Generator<unknown>): unknown };
  effect(factory: () => (() => void), label?: string): unknown;
  get?(name: string): any;
  on?(event: string, callback: () => void): () => void;
}
export const name = 'chiyang-plugin-store-client';
export const inject = ['slots', 'layout', 'remote', 'remote.pluginManager', 'remoteAccess'];
export function createHarnessBridge(ctx: HarnessContext): Bridge {
  return {
    mode: 'harness', manager: adaptManager(ctx.remote.pluginManager),
    subscribe: (event, callback) => event === 'connection/reset' ? ctx.on?.(event, () => callback(undefined)) ?? (() => {}) : ctx.remote.$on(event, callback),
    openNative: name => { const navigation = ctx.get?.('pluginNavigation'); if (navigation) navigation.openBundle(name); else ctx.get?.('layout')?.selectPanel('plugins'); },
  };
}
export function apply(ctx: HarnessContext): void {
  try { registerStore(ctx); } catch (error) { console.error('[dsh-plugin-store] activation failed', error); throw error; }
}
function registerStore(ctx: HarnessContext): void {
  ctx.effect(() => {
    const style = document.createElement('style');
    style.dataset.dshPluginStore = 'chiyang001'; style.textContent = css + '\n' + paperCss; document.head.append(style);
    return () => style.remove();
  }, 'plugin-store: scoped stylesheet');
  const bridge = createHarnessBridge(ctx);
  const panels = function* () {
    yield ctx.slots.inject('main', () => ctx.slots.register({ name: 'main', key: 'chiyang-plugin-store', inject: () => ({ bridge }) }, App));
    yield ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({ name: 'sidebar.panellist', id: 'chiyang-plugin-store', order: 5, label: () => '插件商店' }, StoreIcon));
  };
  if (typeof ctx.remoteAccess.whenAccess === 'function') ctx.remoteAccess.whenAccess('pluginManager/listBundles', panels);
  else for (const _registration of panels()) { /* Older 0.2 hosts enforce access on each Remote invocation. */ }
}
function StoreIcon({ size = 20 }: { size?: number }) { return <Icon name="boxes" size={size}/>; }
