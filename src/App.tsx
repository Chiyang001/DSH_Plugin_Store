import { useCallback, useEffect, useRef, useState } from 'react';
import { Icon } from './icons';
import { dailyPoem } from './poetry';
import { RegistrySettings } from './RegistrySettings';
import { installationRegistry, registrySettings, type RegistrySettings as InstallRegistrySettings } from './registry';
import { bundlePlugin, catalogBatch, categories, dailyRecommendations, filterPlugins, isOfficialPlugin, mergeCatalog, outcome, pluginCompatibility, recommendationReason, safeLogo, shanghaiDay } from './model';
import { discoverGithub, fetchJson, httpsUrl, parseIndex } from './network';
import { readStorage, writeStorage } from './storage';
import type { Bridge, Bundle, Category, ChangeResult, Plugin, Source, Version } from './types';
import community from './data/community.json';
import official from './data/official.json';
import developerLogo from '../developer.png';
import { version } from '../package.json';

type Page = 'home' | 'today' | 'installed' | 'favorites' | 'sources' | 'about';
type Dialog = { kind: 'detail' | 'install' | 'remove'; plugin: Plugin } | { kind: 'source' } | { kind: 'more' } | { kind: 'update'; plugin: Plugin; versions: Version[]; registry?: string | null };
const pageNames: Record<Page, string> = { home: '发现插件', today: '今日推荐', installed: '已安装', favorites: '我的收藏', sources: '插件源', about: '关于商店' };
const navItems: { page: Page; icon: string; label: string }[] = [
  { page: 'home', icon: 'compass', label: '发现' },
  { page: 'today', icon: 'sun', label: '今日推荐' },
  { page: 'installed', icon: 'package', label: '已安装' }, { page: 'favorites', icon: 'bookmark', label: '我的收藏' },
];
const originNames = { official: 'DeepSeek 官方', github: 'GitHub 社区', index: '订阅源' };
const snapshot = community.plugins as Plugin[];
const officialSnapshot = official.plugins as Plugin[];
const favoriteInitial = () => { const data = readStorage<unknown>('favorites', []); return Array.isArray(data) ? data.filter((id): id is string => typeof id === 'string') : []; };
const sourcesInitial = () => { const data = readStorage<unknown>('sources', []); return Array.isArray(data) ? data.filter((s): s is Source => !!s && typeof s === 'object' && typeof s.id === 'string' && typeof s.name === 'string' && typeof s.url === 'string' && typeof s.enabled === 'boolean') : []; };
const builtinInitial = () => { const data = readStorage<any>('builtinSources', {}); return { official: typeof data?.official === 'boolean' ? data.official : true, github: typeof data?.github === 'boolean' ? data.github : true }; };

function PluginMark({ plugin, large = false }: { plugin: Plugin; large?: boolean }) {
  const [failed, setFailed] = useState(false);
  const logo = safeLogo(plugin.logo);
  useEffect(() => setFailed(false), [logo]);
  return <div className={`store-plugin-mark ${plugin.color} ${large ? 'large' : ''} ${logo && !failed ? 'has-logo' : 'is-placeholder'}`} title={logo && !failed ? '插件原始图标' : '插件未提供可用图标，使用分类占位'}>{logo && !failed ? <img src={logo} alt={`${plugin.name} 图标`} loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setFailed(true)}/> : <Icon name={plugin.icon} size={large ? 32 : 26} />}</div>;
}
function DeveloperAvatar({ large = false }: { large?: boolean }) { return <img className={`store-developer-logo ${large ? 'large' : ''}`} src={developerLogo} alt="炽阳001 开发者 logo"/>; }
function Empty({ icon, title, text, action }: { icon: string; title: string; text: string; action?: React.ReactNode }) {
  return <div className="store-empty"><div className="store-empty-icon"><Icon name={icon} size={32} /></div><h3>{title}</h3><p>{text}</p>{action}</div>;
}

export function App({ bridge }: { bridge: Bridge }) {
  const [page, setPage] = useState<Page>('home');
  const [category, setCategory] = useState<Category>('all');
  const [query, setQuery] = useState(''); const [origin, setOrigin] = useState('all'); const [sort, setSort] = useState('recommended');
  const [theme, setTheme] = useState(() => readStorage('theme', 'light'));
  const [favorites, setFavorites] = useState<string[]>(favoriteInitial);
  const [hideOfficialInstalled, setHideOfficialInstalled] = useState(() => readStorage<unknown>('hide-official-installed', true) !== false);
  const [sources, setSources] = useState<Source[]>(sourcesInitial);
  const [builtinSources, setBuiltinSources] = useState(builtinInitial);
  const [installRegistry, setInstallRegistry] = useState(() => registrySettings(readStorage<unknown>('install-registry', null)));
  const [githubPlugins, setGithubPlugins] = useState<Plugin[]>(snapshot);
  const [fetchedAt, setFetchedAt] = useState(community.fetchedAt);
  const [indexPlugins, setIndexPlugins] = useState<Record<string, Plugin[]>>({});
  const [sourceErrors, setSourceErrors] = useState<Record<string, string>>({});
  const [bundles, setBundles] = useState<Bundle[]>([]); const [loadError, setLoadError] = useState('');
  const [loading, setLoading] = useState(false); const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(false); const busyRef = useRef(false);
  const [dialog, setDialog] = useState<Dialog | null>(null); const [sourceUrl, setSourceUrl] = useState(''); const [sourceName, setSourceName] = useState('');
  const [notice, setNotice] = useState<{ text: string; error?: boolean } | null>(null);
  const [logs, setLogs] = useState(''); const [operation, setOperation] = useState('');
  const [selectedVersion, setSelectedVersion] = useState('');
  const [today, setToday] = useState(shanghaiDay);
  const [visibleCount, setVisibleCount] = useState(24);
  const [batch, setBatch] = useState(0);
  const [cardView, setCardView] = useState<'grid' | 'list'>(() => readStorage<string>('card-view', 'grid') === 'list' ? 'list' : 'grid');
  const searchRef = useRef<HTMLInputElement>(null); const dialogRef = useRef<HTMLDialogElement>(null);
  const mainRef = useRef<HTMLElement>(null);
  const activeRequest = useRef<string | null>(null); const lifetime = useRef<AbortController | null>(null);
  const notify = useCallback((text: string, error = false) => setNotice({ text, error }), []);
  const save = useCallback((key: string, value: unknown) => { if (!writeStorage(key, value)) notify('浏览器未允许保存设置，本次更改仅在当前页面有效。', true); }, [notify]);
  const loadBundles = useCallback(async () => {
    if (!bridge.manager) return;
    setLoading(true);
    try { const data = await bridge.manager.listBundles(); if (!Array.isArray(data)) throw new Error('宿主插件列表格式无效。'); setBundles(data); setLoadError(''); }
    catch (error) { setLoadError(error instanceof Error ? error.message : String(error)); }
    finally { setLoading(false); }
  }, [bridge]);
  const loadSource = useCallback(async (source: Source, signal?: AbortSignal) => {
    try {
      const data = parseIndex(await fetchJson(httpsUrl(source.url), signal, { maxBytes: 8 * 1024 * 1024 }), source.name, source.url);
      setIndexPlugins(old => ({ ...old, [source.id]: data }));
      setSourceErrors(old => { const next = { ...old }; delete next[source.id]; return next; });
      return data.length;
    } catch (error) { if (signal?.aborted) return 0; setSourceErrors(old => ({ ...old, [source.id]: error instanceof Error ? error.message : String(error) })); throw error; }
  }, []);
  useEffect(() => {
    const controller = new AbortController(); lifetime.current = controller;
    void loadBundles();
    for (const source of sourcesInitial().filter(s => s.enabled)) void loadSource(source, controller.signal).catch(() => {});
    const off = bridge.subscribe?.('plugin-manager/changed', () => { void loadBundles(); });
    const offReset = bridge.subscribe?.('connection/reset', () => { void loadBundles(); });
    const offLog = bridge.subscribe?.('plugin-manager/install-log', chunk => {
      if (activeRequest.current && chunk.requestId === activeRequest.current) setLogs(old => (old + chunk.text).slice(-24000));
    });
    return () => { controller.abort(); off?.(); offReset?.(); offLog?.(); };
  }, [bridge, loadBundles, loadSource]);
  useEffect(() => { if (!notice || notice.error) return; const id = setTimeout(() => setNotice(null), 6500); return () => clearTimeout(id); }, [notice]);
  useEffect(() => { const id = setInterval(() => setToday(shanghaiDay()), 60000); return () => clearInterval(id); }, []);
  useEffect(() => setVisibleCount(24), [query, category, origin, sort, page]);
  useEffect(() => setBatch(0), [query, category, origin, sort, page]);
  useEffect(() => { mainRef.current?.scrollTo({ top: 0, behavior: 'instant' }); }, [page]);
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); searchRef.current?.focus(); }
    };
    window.addEventListener('keydown', key); return () => window.removeEventListener('keydown', key);
  }, []);
  useEffect(() => {
    const element = dialogRef.current;
    if (dialog && element && !element.open) element.showModal();
    return () => { if (element?.open) element.close(); };
  }, [dialog]);
  const navigate = (next: Page) => { setPage(next); setQuery(''); setCategory('all'); setOrigin('all'); setSort('recommended'); if (!busy) setDialog(null); };
  const toggleFavorite = (id: string) => { const next = favorites.includes(id) ? favorites.filter(x => x !== id) : [...favorites, id]; setFavorites(next); save('favorites', next); };
  const basePlugins = [...(builtinSources.github ? githubPlugins : []), ...(bridge.mode === 'preview' && builtinSources.official ? officialSnapshot : []), ...sources.filter(s => s.enabled).flatMap(s => indexPlugins[s.id] ?? [])];
  const catalog = mergeCatalog(basePlugins, bundles.filter(b => builtinSources.official || !b.official));
  const managed = bundles.filter(b => b.installed || b.enabled || b.availability === 'installation' && b.optional);
  const displayPlugins = page === 'installed' ? managed.map(b => catalog.find(p => p.id === b.name) ?? bundlePlugin(b)) : page === 'favorites' ? catalog.filter(p => favorites.includes(p.id)) : catalog;
  const sorted = filterPlugins(displayPlugins, { query, category, origin, sort, hideOfficial: page === 'installed' && hideOfficialInstalled });
  const filtered = catalogBatch(sorted, batch);
  const heroTiles = catalog.filter(p => !isOfficialPlugin(p) && p.logo).slice(0, 3);
  const communityCount = catalog.filter(p => p.origin === 'github').length;
  const authorCount = new Set(catalog.filter(p => p.origin === 'github').map(p => p.author)).size;
  const runtimeVersion = bundles.find(b => b.name === '@deepseek-ai/dsh-base')?.version;
  const poem = dailyPoem(today);
  const daily = dailyRecommendations(catalog, today, 6, runtimeVersion, batch);
  const dailyFiltered = filterPlugins(daily, { query, category, origin, sort: 'recommended' });
  const canChangeBatch = ['home', 'today', 'favorites'].includes(page);
  const changeBatch = () => { setBatch(value => value + 1); setVisibleCount(24); };
  const hasFilters = !!query || category !== 'all' || origin !== 'all';
  const toggleOfficialInstalled = (hidden: boolean) => { setHideOfficialInstalled(hidden); save('hide-official-installed', hidden); };
  const resetFilters = () => { setQuery(''); setCategory('all'); setOrigin('all'); };

  async function refresh() {
    if (refreshing) return; setRefreshing(true);
    let count = 0; const problems: string[] = [];
    try {
      await loadBundles();
      if (builtinSources.github) {
        try {
          const savedPage = readStorage<unknown>('discovery-page', 1);
          const page = typeof savedPage === 'number' && Number.isInteger(savedPage) && savedPage >= 1 && savedPage <= 10 ? savedPage : 1;
          const result = await discoverGithub(lifetime.current?.signal, { page });
          if (result.scanned > 0) save('discovery-page', page === 10 ? 1 : page + 1);
          if (result.plugins.length) { setGithubPlugins(old => { const merged = new Map(old.map(p => [p.id, p])); for (const p of result.plugins) { const previous = merged.get(p.id); merged.set(p.id, { ...previous, ...p, logo: p.logo || previous?.logo, logoSource: p.logoSource || previous?.logoSource }); } return [...merged.values()]; }); setFetchedAt(new Date().toISOString()); count += result.plugins.length; }
          if (result.warnings.length) problems.push(`${result.warnings.length} 项搜索或验证提示`);
          if (!result.plugins.length) problems.push('未发现可用的 GitHub 插件，保留原目录');
        } catch (error) { problems.push(error instanceof Error ? error.message : String(error)); }
      }
      for (const source of sources.filter(s => s.enabled)) {
        try { count += await loadSource(source, lifetime.current?.signal); } catch { problems.push(`${source.name} 更新失败`); }
      }
      notify(problems.length ? `刷新完成：${problems.join('；')}。可继续浏览上次的目录。` : `已同步插件目录${count ? `，读取 ${count} 个条目` : ''}。`, !!problems.length);
    } finally { setRefreshing(false); }
  }
  async function run(label: string, task: () => Promise<ChangeResult>) {
    if (!bridge.manager || busyRef.current) return;
    busyRef.current = true; setBusy(true); setOperation(label); setLogs('');
    try {
      const result = await task(); const status = outcome(result);
      if (result.pendingBuilds?.length) notify(`安装被宿主阻止：这些包需要显式批准构建脚本：${result.pendingBuilds.join('、')}。请在原生插件管理器中审查后处理。`, true);
      else notify(status.message, !status.ok);
      if (result.packageResult?.output) setLogs(result.packageResult.output.slice(-24000));
      if (status.ok) setDialog(null);
      await loadBundles();
    } catch (error) { notify(error instanceof Error ? error.message : String(error), true); }
    finally { busyRef.current = false; setBusy(false); setOperation(''); activeRequest.current = null; }
  }
  const saveInstallRegistry = (settings: InstallRegistrySettings) => {
    setInstallRegistry(settings);
    const saved = writeStorage('install-registry', settings);
    notify(saved ? '安装源已保存，下次安装时生效。' : '安装源在本次会话中生效；浏览器未允许保存设置。', !saved);
  };
  async function install(plugin: Plugin) {
    if (!bridge.manager || !plugin.spec) return;
    await run(`正在检查并安装 ${plugin.name}`, async () => {
      const registry = installationRegistry(installRegistry, plugin.registry);
      const inspection = await bridge.manager!.inspect(plugin.spec!, { registry });
      if (inspection.status !== 'accepted' || inspection.bundle === false) throw new Error(inspection.reason || '此来源不是可安装的 DSH 插件包。');
      const requestId = crypto.randomUUID(); activeRequest.current = requestId;
      return bridge.manager!.installBundle(plugin.spec!, { enabled: true, saveExact: true, requestId, registry });
    });
  }
  async function checkUpdate(plugin: Plugin) {
    if (!bridge.manager || busyRef.current) return;
    busyRef.current = true; setBusy(true); setOperation(`正在检查 ${plugin.name} 的新版本`);
    try {
      const result = await bridge.manager.listVersions(plugin.id);
      if (result.status !== 'listed') throw new Error(result.reason || '这个插件不支持通过 npm 检查更新。');
      const versions = (result.versions ?? []).filter(v => v.bundle && !v.prerelease && !v.incompatible && !v.deprecated);
      if (!versions.length) notify('当前已是可用的最新稳定版本。');
      else { setSelectedVersion(versions[0].version); setDialog({ kind: 'update', plugin, versions, registry: result.registry }); }
    } catch (error) { notify(error instanceof Error ? error.message : String(error), true); }
    finally { busyRef.current = false; setBusy(false); setOperation(''); }
  }
  async function addSource() {
    if (busyRef.current) return;
    busyRef.current = true; setBusy(true);
    try {
      const url = httpsUrl(sourceUrl.trim()); if (sources.some(s => s.url === url)) throw new Error('这个源已经添加过了。');
      const source = { id: crypto.randomUUID(), name: sourceName.trim() || new URL(url).hostname, url, enabled: true };
      const count = await loadSource(source, lifetime.current?.signal);
      const next = [...sources, source]; setSources(next); save('sources', next); setDialog(null); setSourceUrl(''); setSourceName(''); notify(`已订阅 ${source.name}，读取 ${count} 个插件。`);
    } catch (error) { notify(`无法添加：${error instanceof Error ? error.message : String(error)}。请检查格式、网络和源的 CORS 设置。`, true); }
    finally { busyRef.current = false; setBusy(false); }
  }
  const installButton = (plugin: Plugin, large = false) => {
    const bundle = bundles.find(b => b.name === plugin.id);
    const present = bundle && bundle.availability !== 'missing';
    return <button className={`store-button ${large ? 'primary' : 'small'} ${bundle?.enabled ? 'installed' : ''}`} disabled={busy || !!bundle?.readOnlyReason || bridge.mode === 'preview' || (!present && !plugin.spec)}
      title={bridge.mode === 'preview' ? '安装到 Harness 后即可使用' : bundle?.readOnlyReason || undefined}
      onClick={() => present ? void run(bundle.enabled ? '停用插件' : '启用插件', () => bridge.manager!.setBundleEnabled(bundle.name, !bundle.enabled)) : setDialog({ kind: 'install', plugin })}>
      <Icon name={bundle?.enabled ? 'check' : present ? 'zap' : 'plus'} size={15} />{bundle?.enabled ? '已启用' : present ? '启用' : '安装'}
    </button>;
  };
  const card = (plugin: Plugin) => <article className="store-card" key={plugin.id}>
    <div className="store-card-top"><button className="store-mark-button" aria-label={`查看 ${plugin.name}`} onClick={() => setDialog({ kind: 'detail', plugin })}><PluginMark plugin={plugin} /></button>
      <button className={`store-icon-button ${favorites.includes(plugin.id) ? 'is-favorite' : ''}`} aria-label={`${favorites.includes(plugin.id) ? '取消收藏' : '收藏'} ${plugin.name}`} aria-pressed={favorites.includes(plugin.id)} onClick={() => toggleFavorite(plugin.id)}><Icon name="bookmark" size={18} /></button></div>
    <button className="store-title-button" onClick={() => setDialog({ kind: 'detail', plugin })}><h3>{plugin.name}</h3>{plugin.origin === 'official' && <Icon name="shield" size={16} />}</button>
    <span className="store-author">{plugin.author}<span>·</span>{originNames[plugin.origin]}</span>
    <p>{plugin.description}</p>
    <div className="store-tags"><span>{categories.find(c => c.id === plugin.category)?.name}</span>{plugin.origin === 'official' && <span className="official-tag">官方</span>}{pluginCompatibility(plugin, runtimeVersion) === 'incompatible' && <span className="store-compatibility-tag" title={`插件声明要求 ${plugin.engines}`}>版本要求不符</span>}</div>
    <div className="store-card-bottom"><span className="store-card-metric">{plugin.stars !== undefined ? <><Icon name="star" size={14} />{new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(plugin.stars)}</> : <><Icon name="package" size={14} />{plugin.version || '跟随宿主版本'}</>}</span>{installButton(plugin)}</div>
  </article>;

  const renderDaily = (compact = false) => <section className={`store-daily-section ${compact ? 'compact' : ''}`}>
    <div className="store-section-heading"><div><h2><Icon name="sun" size={21}/> 今日推荐 <span className="store-daily-date">{today.slice(5).replace('-', ' / ')}</span></h2><p className="store-section-description">每天发现不同的工具，给熟悉的工作一点新可能。</p></div>{compact && <button onClick={() => navigate('today')}>今日完整清单 <Icon name="arrow" size={15}/></button>}</div>
    {!compact && <div className="store-daily-intro"><div><span className="store-eyebrow">A LITTLE DISCOVERY, EVERY DAY.</span><h2>今天，给工作加一点新能力。</h2><p>从社区创意出发，发现值得尝试的新工具。按中国时间每日轮换，兼顾分类、维护信息和版本兼容性。</p><figure className="store-daily-poem" aria-label="每日诗词"><blockquote>{poem.text}</blockquote><figcaption>{poem.author}《{poem.title}》</figcaption></figure></div><div className="store-calendar"><span>{today.slice(0, 7).replace('-', ' / ')}</span><strong>{today.slice(8)}</strong><span>DAILY PICKS</span></div></div>}
    <div className="store-daily-grid">{compact ? daily.slice(0, 3).map((plugin, i) => <button className="store-daily-shortcut" key={plugin.id} onClick={() => setDialog({ kind: 'detail', plugin })}><PluginMark plugin={plugin}/><div><span>0{i + 1} / {categories.find(c => c.id === plugin.category)?.name}</span><h3>{plugin.name}</h3><p>{plugin.author}</p></div><Icon name="arrowUp" size={17}/></button>) : dailyFiltered.map((plugin, i) => <article className={`store-daily-card ${plugin.color}`} key={plugin.id}><div className="store-daily-card-top"><PluginMark plugin={plugin}/><span className="store-daily-number">0{i + 1}</span><button className={`store-icon-button ${favorites.includes(plugin.id) ? 'is-favorite' : ''}`} aria-label={`${favorites.includes(plugin.id) ? '取消收藏' : '收藏'} ${plugin.name}`} onClick={() => toggleFavorite(plugin.id)}><Icon name="bookmark" size={17}/></button></div><span className="store-daily-category">{categories.find(c => c.id === plugin.category)?.name} <span> / </span>{originNames[plugin.origin]}</span><button className="store-title-button" onClick={() => setDialog({ kind: 'detail', plugin })}><h3>{plugin.name}</h3><Icon name="arrowUp" size={15}/></button><p className="store-daily-description">{plugin.description}</p><div className="store-recommendation-reason"><Icon name="sparkles" size={14}/>{recommendationReason(plugin)}</div><div className="store-daily-card-footer"><span>{plugin.author}</span>{installButton(plugin)}</div></article>)}</div>
    {!compact && !dailyFiltered.length && <Empty icon="search" title="今日推荐中没有匹配项" text="试试其他搜索词，或回到发现页探索完整目录。" action={<button className="store-button" onClick={() => navigate('home')}>浏览全部插件 <Icon name="arrow" size={15}/></button>}/>}
  </section>;

  return <div className={`dsh-store ${theme === 'dark' ? 'dark' : ''}`}>
    <aside className="store-sidebar">
      <button className="store-brand" onClick={() => navigate('home')} aria-label="回到发现首页"><span className="store-brand-mark"><i/><i/><i/><i/></span><span>Harness<span>PLUGIN STORE</span></span></button>
      <div className="store-nav-label">探索你的可能</div>
      <nav>{navItems.map(item => <button key={item.page} className={`store-nav-item ${page === item.page ? 'active' : ''}`} onClick={() => navigate(item.page)}><Icon name={item.icon} size={19} /><span>{item.label}</span>{item.page === 'installed' && managed.length > 0 && <b>{managed.length}</b>}{item.page === 'favorites' && favorites.length > 0 && <b>{favorites.length}</b>}</button>)}</nav>
      <div className="store-nav-label second">工作空间</div>
      <button className={`store-nav-item ${page === 'sources' ? 'active' : ''}`} onClick={() => navigate('sources')}><Icon name="layers" size={19}/><span>插件源</span></button>
      <button className={`store-nav-item ${page === 'about' ? 'active' : ''}`} onClick={() => navigate('about')}><Icon name="info" size={19}/><span>关于商店</span></button>
      <div className="store-sidebar-bottom"><div className="store-creator-card"><span className="store-mini-spark"><Icon name="sparkles" size={18}/></span><strong>留一页，给新的可能。</strong><p>发现社区的创意，<br/>拓展 Harness 的边界。</p><a href="https://github.com/topics/dsh-plugin" target="_blank" rel="noreferrer">探索开源社区 <Icon name="arrowUp" size={14}/></a></div>
        <div className="store-profile"><DeveloperAvatar/><div><strong>炽阳001</strong><span>商店开发者</span></div><span className="store-profile-links"><a className="store-icon-button store-bilibili-button" href="https://space.bilibili.com/404891612" target="_blank" rel="noreferrer" aria-label="访问炽阳001的B站主页" title="B站主页"><Icon name="bilibili" size={18}/></a><a className="store-icon-button" aria-label="开发者 GitHub" href="https://github.com/Chiyang001?tab=repositories" target="_blank" rel="noreferrer"><Icon name="github" size={18}/></a></span></div></div>
    </aside>
    <main className="store-main" ref={mainRef}>
      <header className="store-header"><div className="store-breadcrumb">插件商店 <span>/</span><strong>{pageNames[page]}</strong></div><div className="store-header-actions"><label className="store-search"><Icon name="search" size={17}/><input ref={searchRef} value={query} onChange={e => { setQuery(e.target.value); if (page === 'sources' || page === 'about') setPage('home'); }} placeholder="搜索插件、功能或作者…" aria-label="搜索插件"/>{query && <button className="store-search-clear" aria-label="清除搜索" onClick={() => setQuery('')}><Icon name="x" size={14}/></button>}</label><button className="store-icon-button" onClick={() => { const next = theme === 'dark' ? 'light' : 'dark'; setTheme(next); save('theme', next); }} aria-label={theme === 'dark' ? '切换浅色主题' : '切换深色主题'}><Icon name={theme === 'dark' ? 'sun' : 'moon'} size={20}/></button></div></header>
      <div className="store-content">
        <div className="store-page-heading"><div><div className="store-eyebrow">YOUR HARNESS, EXPANDED.</div><h1>{pageNames[page]}<span className="store-heading-dot">.</span></h1><p>{page === 'home' ? '为每一个灵感，找到恰到好处的工具。' : page === 'today' ? '每天一份新发现，与你的工作方式相遇。' : page === 'installed' ? '你的工具箱，由你掌控。' : page === 'favorites' ? '把心动的工具，留给下一次灵感。' : page === 'sources' ? '连接官方与开源社区，让好插件汇集于此。' : '万物皆插件，每个人都可以拓展自己的可能。'}</p></div><button className="store-button" onClick={() => canChangeBatch ? changeBatch() : void refresh()} disabled={!canChangeBatch && refreshing}><Icon name={!canChangeBatch && refreshing ? 'loading' : 'refresh'} size={16}/>{canChangeBatch ? '换一批' : refreshing ? '更新中…' : '更新目录'}</button></div>
        {bridge.mode === 'preview' && <div className="store-preview-note"><span className="store-status-dot"/><span>独立预览模式</span><span className="store-preview-note-text">安装到 DeepSeek Harness 后，即可管理真实插件。</span><button onClick={() => navigate('about')}>查看安装说明 <Icon name="arrow" size={14}/></button></div>}
        {loadError && <div className="store-error" role="alert">无法读取宿主插件：{loadError}<button onClick={() => void loadBundles()}>重试</button></div>}
        {busy && operation && <div className="store-operation" role="status"><Icon name="loading" size={17}/>{operation}</div>}

        {page === 'home' && !hasFilters && <>
          <section className="store-hero-grid"><div className="store-hero"><div className="store-hero-copy"><span className="store-hero-label"><Icon name="sparkles" size={13}/> 灵感，从这里延伸</span><h2>让好工具，<br/><em>成为灵感的注脚。</em></h2><p>翻阅官方与社区的好工具，<br/>为下一次创作，留一页可能。</p><div className="store-hero-actions"><button className="store-button primary" onClick={() => document.getElementById('store-catalog')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>浏览全部插件 <Icon name="arrow" size={16}/></button><button className="store-hero-secondary" onClick={() => document.getElementById('store-category-filters')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>按分类探索 <Icon name="arrowUp" size={15}/></button></div><div className="store-hero-foot"><span>发现</span><i/><span>连接</span><i/><span>构建属于你的工作流</span></div></div><div className="store-hero-art" aria-hidden="true"><div className="store-orbit orbit-one"/><div className="store-orbit orbit-two"/><span className="store-orbit-dot dot-one"/><span className="store-orbit-dot dot-two"/><div className="store-art-core"><span className="store-brand-mark"><i/><i/><i/><i/></span></div><span className="store-art-tile tile-code">{heroTiles[0] ? <PluginMark plugin={heroTiles[0]}/> : <Icon name="package" size={26}/>}</span><span className="store-art-tile tile-zap">{heroTiles[1] ? <PluginMark plugin={heroTiles[1]}/> : <Icon name="package" size={26}/>}</span><span className="store-art-tile tile-brain">{heroTiles[2] ? <PluginMark plugin={heroTiles[2]}/> : <Icon name="package" size={26}/>}</span><span className="store-art-spark">✦</span></div></div><div className="store-editorial"><span className="store-editorial-top"><Icon name="github" size={20}/> 来自开源社区</span><div className="store-editorial-art" aria-hidden="true"><div/><div/><div/><Icon name="plug" size={50}/></div><span className="store-editorial-label">社区的创造力</span><h3>好想法，值得被看见。</h3><div className="store-community-metrics"><span><strong>{communityCount}</strong><small>社区插件</small></span><span><strong>{authorCount}</strong><small>开发者</small></span></div><button onClick={() => { setOrigin('github'); setSort('stars'); }}>逛逛社区插件 <Icon name="arrowUp" size={17}/></button></div></section>
          <div className="store-discovery-strip"><span><Icon name="shield" size={17}/><strong>官方能力</strong> 与 Harness 同步</span><span><Icon name="github" size={17}/><strong>开源社区</strong> 查看真实来源</span><span><Icon name="sliders" size={17}/><strong>轻松管理</strong> 工具尽在掌握</span></div>

        </>}

        {page === 'home' && !hasFilters && renderDaily(true)}
        {page === 'today' && renderDaily()}

        {(page === 'home' || page === 'favorites' || page === 'installed') && <section className="store-catalog" id="store-catalog">
          <div className="store-section-heading catalog-heading"><h2>{page === 'home' ? '发现你的下一个好工具' : page === 'favorites' ? '已收藏的灵感' : '插件工具箱'}<span className="store-count">{filtered.length}</span></h2><div className="store-catalog-controls">{page === 'installed' && <label className="store-hide-official"><input type="checkbox" checked={hideOfficialInstalled} onChange={event => toggleOfficialInstalled(event.target.checked)}/>隐藏官方插件</label>}<div className="store-view-switch" role="group" aria-label="目录布局"><button className={cardView === 'grid' ? 'active' : ''} aria-label="卡片视图" aria-pressed={cardView === 'grid'} onClick={() => { setCardView('grid'); save('card-view', 'grid'); }}><Icon name="grid" size={16}/></button><button className={cardView === 'list' ? 'active' : ''} aria-label="列表视图" aria-pressed={cardView === 'list'} onClick={() => { setCardView('list'); save('card-view', 'list'); }}><Icon name="list" size={17}/></button></div><label className="store-sort"><Icon name="sliders" size={15}/><select aria-label="插件排序" value={sort} onChange={e => setSort(e.target.value)}><option value="recommended">综合推荐</option><option value="stars">GitHub 星标</option><option value="newest">最近更新</option></select><Icon name="down" size={13}/></label></div></div>
          <div className="store-filters" id="store-category-filters"><div className="store-filter-tabs" role="group" aria-label="插件分类">{categories.map(c => <button key={c.id} className={category === c.id ? 'active' : ''} onClick={() => setCategory(c.id)}>{c.id === 'all' && <Icon name="grid" size={14}/>} {c.name}</button>)}</div><label className="store-origin"><select aria-label="插件来源" value={origin} onChange={e => setOrigin(e.target.value)}><option value="all">全部来源</option><option value="official">DeepSeek 官方</option><option value="github">GitHub 社区</option><option value="index">订阅源</option></select><Icon name="down" size={13}/></label></div>
          {loading && !bundles.length && bridge.mode === 'harness' ? <div className="store-loading"><Icon name="loading"/>正在读取 Harness 插件…</div> : page === 'installed' && bridge.mode === 'preview' ? <Empty icon="package" title="你的工具箱，准备就绪" text="将商店安装到 DeepSeek Harness，已安装的插件会自动出现在这里。" action={<button className="store-button primary" onClick={() => navigate('about')}>查看安装说明 <Icon name="arrow" size={15}/></button>}/> : page === 'installed' && hideOfficialInstalled && !hasFilters && !filtered.length ? <Empty icon="package" title="暂时没有社区插件" text="已隐藏官方插件，关闭开关可查看全部已安装插件。" action={<button className="store-button" onClick={() => toggleOfficialInstalled(false)}>显示官方插件</button>}/> : !filtered.length ? <Empty icon={page === 'favorites' ? 'bookmark' : 'search'} title={page === 'favorites' && !favorites.length ? '给好工具留个位置' : '暂时没有匹配的插件'} text={page === 'favorites' && !favorites.length ? '点击插件卡片右上角的收藏按钮，随时回来找到它。' : '试试其他关键词、分类或来源。'} action={<button className="store-button" onClick={() => { if (page === 'favorites') navigate('home'); else resetFilters(); }}>{page === 'favorites' ? '去发现插件' : '重置筛选'}<Icon name="arrow" size={15}/></button>}/> : page === 'installed' ? <div className="store-installed-list">{filtered.map(p => { const b = bundles.find(b => b.name === p.id)!; return <article className="store-installed-row" key={p.id}><PluginMark plugin={p}/><div className="store-installed-info"><button className="store-title-button" onClick={() => setDialog({ kind: 'detail', plugin: p })}><h3>{p.name}</h3></button><p>{p.description}</p><span>{p.version ? `v${p.version}` : '宿主内置'}<span>·</span>{b.error ? '加载异常' : b.enabled ? '已启用' : '已停用'}{b.readOnlyReason && <span>受宿主管理</span>}</span></div><div className="store-installed-actions">{b.updatable && <button className="store-button small" disabled={busy} onClick={() => void checkUpdate(p)}><Icon name="refresh" size={14}/>检查更新</button>}{installButton(p)}{bridge.openNative && <button className="store-icon-button" aria-label={`配置 ${p.name}`} onClick={() => bridge.openNative!(p.id)}><Icon name="settings" size={17}/></button>}<button className="store-icon-button danger" disabled={busy || !b.removable || !!b.readOnlyReason || p.id === 'dsh-plugin-store'} aria-label={`卸载 ${p.name}`} title={b.removable ? '卸载插件' : '内置插件不可卸载'} onClick={() => setDialog({ kind: 'remove', plugin: p })}><Icon name="trash" size={17}/></button></div></article>; })}</div> : <div className={`store-card-grid ${cardView === 'list' ? 'list-view' : ''}`}>{filtered.slice(0, visibleCount).map(card)}</div>}
          {page !== 'installed' && filtered.length > visibleCount && <div className="store-load-more"><span>已显示 {visibleCount} / {filtered.length} 个插件</span><button className="store-button" onClick={() => setVisibleCount(count => count + 24)}>继续发现 <Icon name="down" size={15}/></button></div>}
        </section>}

        {page === 'sources' && <section><RegistrySettings value={installRegistry} onSave={saveInstallRegistry} busy={busy}/><div className="store-section-heading"><h2>已连接的源<span className="store-count">{2 + sources.length}</span></h2><button className="store-button primary" onClick={() => { setSourceUrl(''); setSourceName(''); setDialog({ kind: 'source' }); }}><Icon name="plus" size={16}/>添加订阅源</button></div><div className="store-sources-list">{(['official', 'github'] as const).map(kind => <article className="store-source-row" key={kind}><span className={`store-source-icon ${kind === 'official' ? 'blue' : 'neutral'}`}><Icon name={kind === 'official' ? 'shield' : 'github'} size={24}/></span><div><h3>{kind === 'official' ? 'DeepSeek 官方源' : 'GitHub 开源社区'}<span className="store-badge">内置</span></h3><p>{kind === 'official' ? bridge.mode === 'harness' ? '从当前 Harness 的官方插件目录读取，保持版本一致。' : '预览来自官方仓库的目录；原生模式自动匹配宿主。' : '按主题、名称、中英文关键词和近期维护多路检索，分批轮换候选，并固定 Git 提交。'}</p><span className="store-source-status">{kind === 'official' ? '官方插件目录' : `上次目录：${new Date(fetchedAt).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}（中国时间）`}</span></div><button role="switch" aria-label={`${kind === 'official' ? '官方源' : 'GitHub 源'}开关`} aria-checked={builtinSources[kind]} className={`store-toggle ${builtinSources[kind] ? 'on' : ''}`} onClick={() => { const next = { ...builtinSources, [kind]: !builtinSources[kind] }; setBuiltinSources(next); save('builtinSources', next); }}><span/></button></article>)}{sources.map(source => <article className="store-source-row" key={source.id}><span className="store-source-icon purple"><Icon name="layers" size={24}/></span><div><h3>{source.name}</h3><p className="store-mono">{source.url}</p><span className={sourceErrors[source.id] ? 'store-source-error' : 'store-source-status'}>{sourceErrors[source.id] || `${indexPlugins[source.id]?.length ?? 0} 个插件 · DSH 格式索引`}</span></div><button role="switch" aria-checked={source.enabled} aria-label={`${source.name}开关`} className={`store-toggle ${source.enabled ? 'on' : ''}`} onClick={() => { const next = sources.map(s => s.id === source.id ? { ...s, enabled: !s.enabled } : s); setSources(next); save('sources', next); if (!source.enabled) void loadSource(source, lifetime.current?.signal).catch(() => {}); }}><span/></button><button className="store-icon-button danger" aria-label={`移除源 ${source.name}`} onClick={() => { const next = sources.filter(s => s.id !== source.id); setSources(next); save('sources', next); }}><Icon name="trash" size={17}/></button></article>)}</div><div className="store-help-box"><Icon name="info" size={20}/><div><h3>把更多好工具带进来</h3><p>支持 HTTPS 的 DSH format: 1 插件索引。源需允许浏览器跨域读取。订阅源的插件会展示来源，安装前可查看具体包名和版本。在线同步会多路检索并轮换搜索页，保留已有目录。子目录 bundle 还可通过索引订阅引入。</p></div></div></section>}

        {page === 'about' && <section className="store-about"><div className="store-about-intro"><DeveloperAvatar large/><h2>Harness 插件商店</h2><span className="store-badge">v{version}</span><p>一个发现、收藏和管理 DeepSeek Harness 插件的地方。<br/>为好奇心而生，为你的工作方式而构建。</p></div><div className="store-about-grid"><article><Icon name="download" size={24}/><h3>安装到 DeepSeek Harness</h3><p>在插件管理中选择安装本地包，或使用 CLI 安装已构建的目录。默认 Web profile 的命令如下；桌面版请使用它实际运行的 profile。</p><pre>dsh plugin --profile web add link:/absolute/path/to/DSH_Plugin_Store</pre><p>重启对应的 Harness 实例，在侧栏打开「插件商店」。需要支持插件管理的 Web / Desktop 界面，目标版本为 0.2.1-rc.5 及之后的 0.2 系列。</p></article><article><Icon name="shield" size={24}/><h3>来源透明，状态真实</h3><p>官方目录来自宿主；社区目录来自 GitHub API。星标和更新时间只展示源提供的数据。清单通过表示具备 bundle 声明，并不代表官方审查或安全认证。</p><p>安装、启停、卸载和更新通过 Harness 官方插件管理接口完成，遵循宿主权限与兼容性检查。主题、收藏和订阅偏好保存在当前浏览器。</p></article></div><div className="store-developer"><DeveloperAvatar/><div><h3>由 炽阳001 开发</h3><p>让好工具被看见，让每个人的 Harness 更进一步。</p></div><a className="store-button" href="https://space.bilibili.com/404891612" target="_blank" rel="noreferrer">Bilibili <Icon name="external" size={14}/></a><a className="store-button" href="https://github.com/Chiyang001?tab=repositories" target="_blank" rel="noreferrer"><Icon name="github" size={16}/>GitHub</a></div></section>}
        <footer className="store-footer"><span><span className="store-status-dot"/>{bridge.mode === 'harness' ? '已连接 DeepSeek Harness' : 'Harness Plugin Store'}<span className="store-footer-divider">/</span>让每一种可能，有处生长。</span><span>v{version}</span></footer>
      </div>
    </main>
    <nav className="store-mobile-nav" aria-label="商店移动导航">{[{ page: 'home', icon: 'compass', label: '发现' }, { page: 'today', icon: 'sun', label: '今日' }, { page: 'installed', icon: 'package', label: '已安装' }].map(item => <button key={item.page} className={page === item.page ? 'active' : ''} aria-current={page === item.page ? 'page' : undefined} onClick={() => navigate(item.page as Page)}><span><Icon name={item.icon} size={21}/></span><small>{item.label}</small></button>)}<button className={['favorites', 'sources', 'about'].includes(page) ? 'active' : ''} onClick={() => setDialog({ kind: 'more' })} aria-label="更多商店功能"><span><Icon name="more" size={22}/></span><small>更多</small></button></nav>
    {notice && <div className={`store-toast ${notice.error ? 'error' : ''}`} role={notice.error ? 'alert' : 'status'}><Icon name={notice.error ? 'info' : 'check'} size={19}/><span>{notice.text}</span><button className="store-icon-button" aria-label="关闭提示" onClick={() => setNotice(null)}><Icon name="x" size={16}/></button></div>}
    {dialog && <dialog ref={dialogRef} className={`store-dialog ${theme === 'dark' ? 'dark' : ''}`} onCancel={event => { if (busy) event.preventDefault(); else setDialog(null); }} onClick={event => { if (event.target === event.currentTarget && !busy) setDialog(null); }}>
      <div className="store-dialog-content"><button className="store-dialog-close store-icon-button" disabled={busy} aria-label="关闭弹窗" onClick={() => setDialog(null)}><Icon name="x" size={20}/></button>
        {dialog.kind === 'more' ? <><DeveloperAvatar/><h2>你的商店</h2><p>收藏好工具，连接更多来源。</p><div className="store-mobile-socials"><span className="store-profile-links"><a className="store-icon-button store-bilibili-button" href="https://space.bilibili.com/404891612" target="_blank" rel="noreferrer" aria-label="访问炽阳001的B站主页" title="B站主页"><Icon name="bilibili" size={18}/></a><a className="store-icon-button" aria-label="开发者 GitHub" href="https://github.com/Chiyang001?tab=repositories" target="_blank" rel="noreferrer"><Icon name="github" size={18}/></a></span></div><div className="store-mobile-more">{[{ page: 'favorites', icon: 'bookmark', label: '我的收藏', detail: `${favorites.length} 个灵感等待实现` }, { page: 'sources', icon: 'layers', label: '插件源', detail: '管理官方、GitHub 和订阅源' }, { page: 'about', icon: 'info', label: '关于商店', detail: '开发者与使用说明' }].map(item => <button key={item.page} onClick={() => navigate(item.page as Page)}><Icon name={item.icon} size={23}/><span><strong>{item.label}</strong><small>{item.detail}</small></span><Icon name="arrow" size={17}/></button>)}</div></> : dialog.kind === 'source' ? <><span className="store-dialog-icon purple"><Icon name="layers" size={28}/></span><h2>连接新的插件源</h2><p>订阅你信任的目录，发现更多可能。</p><form onSubmit={e => { e.preventDefault(); void addSource(); }}><label className="store-field">源名称<input value={sourceName} onChange={e => setSourceName(e.target.value)} placeholder="例如：我的精选插件" maxLength={60}/></label><label className="store-field">索引地址<input type="url" required value={sourceUrl} onChange={e => setSourceUrl(e.target.value)} placeholder="https://example.com/index.json"/></label><p className="store-field-note">仅支持 HTTPS 与 DSH format: 1。会先验证目录，成功后保存。</p><div className="store-dialog-actions"><button type="button" className="store-button" disabled={busy} onClick={() => setDialog(null)}>取消</button><button className="store-button primary" disabled={busy}>{busy ? <Icon name="loading" size={16}/> : <Icon name="plus" size={16}/>}连接订阅源</button></div></form></> : <>
          <PluginMark plugin={dialog.plugin} large/><span className="store-dialog-origin">{originNames[dialog.plugin.origin]}</span><h2>{dialog.kind === 'remove' ? '卸载 ' : dialog.kind === 'install' ? '安装 ' : dialog.kind === 'update' ? '更新 ' : ''}{dialog.plugin.name}</h2><p>{dialog.plugin.description}</p>
          {dialog.kind === 'detail' && <><div className="store-detail-facts"><div><span>开发者</span><strong>{dialog.plugin.author}</strong></div><div><span>版本</span><strong>{dialog.plugin.version || '跟随宿主'}</strong></div><div><span>分类</span><strong>{categories.find(c => c.id === dialog.plugin.category)?.name}</strong></div></div><div className="store-detail-meta"><span>包名称</span><code>{dialog.plugin.id}</code>{dialog.plugin.registry && <><span>安装源</span><code>{dialog.plugin.registry}</code></>}<span>图标来源</span><span>{dialog.plugin.logo ? dialog.plugin.logoKind === 'host' ? 'Harness 宿主原始图标' : dialog.plugin.logoSource ? <a href={dialog.plugin.logoSource} target="_blank" rel="noreferrer" className="store-text-link">插件仓库原始资源 <Icon name="external" size={12}/></a> : '插件索引原始图标' : '未提供可用图标，显示分类占位'}</span>{dialog.plugin.engines && <><span>Harness 要求</span><code>{dialog.plugin.engines}</code><span>版本声明</span><span>{!runtimeVersion ? '未读取宿主版本' : pluginCompatibility(dialog.plugin, runtimeVersion) === 'compatible' ? '符合当前宿主版本声明' : pluginCompatibility(dialog.plugin, runtimeVersion) === 'incompatible' ? '与当前宿主版本声明不符' : '无法判断，安装时由宿主检查'}</span></>}{dialog.plugin.license && <><span>许可证</span><span>{dialog.plugin.license}</span></>}{dialog.plugin.commit && <><span>固定提交</span><code>{dialog.plugin.commit}</code></>}{dialog.plugin.updatedAt && <><span>仓库更新</span><span>{new Date(dialog.plugin.updatedAt).toLocaleDateString('zh-CN')}</span></>}</div><div className="store-help-box compact"><Icon name="info" size={17}/><p>{bridge.mode === 'preview' ? '当前为独立预览。在 Harness 中打开商店后，可直接安装与管理。' : dialog.plugin.origin === 'official' ? '该插件的可用性和版本由当前 Harness 宿主提供。' : '社区插件在你的宿主环境运行，安装前请查看仓库与说明。'}</p></div><div className="store-dialog-actions"><button className={`store-button ${favorites.includes(dialog.plugin.id) ? 'is-favorite' : ''}`} onClick={() => toggleFavorite(dialog.plugin.id)}><Icon name="bookmark" size={16}/>{favorites.includes(dialog.plugin.id) ? '已收藏' : '收藏'}</button>{dialog.plugin.url && <a className="store-button" href={dialog.plugin.url} target="_blank" rel="noreferrer">查看源码 <Icon name="external" size={14}/></a>}{installButton(dialog.plugin, true)}</div></>}
          {dialog.kind === 'install' && <><div className="store-detail-meta"><span>安装来源</span><code>{dialog.plugin.spec}</code><span>安装镜像</span><code>{installationRegistry(installRegistry, dialog.plugin.registry)}</code></div><p className="store-field-note">安装后自动启用。宿主会检查兼容性；需要执行构建脚本的包由宿主另行审核。</p><div className="store-dialog-actions"><button className="store-button" disabled={busy} onClick={() => setDialog(null)}>取消</button><button className="store-button primary" disabled={busy} onClick={() => void install(dialog.plugin)}><Icon name={busy ? 'loading' : 'download'} size={16}/>{busy ? '安装中…' : '确认安装'}</button></div></>}
          {dialog.kind === 'remove' && <><div className="store-help-box compact"><Icon name="info" size={18}/><p>将从当前 profile 卸载此插件，使用该 profile 的所有会话都会受到影响。</p></div><div className="store-dialog-actions"><button className="store-button" disabled={busy} onClick={() => setDialog(null)}>取消</button><button className="store-button destructive" disabled={busy} onClick={() => void run('正在卸载插件', () => bridge.manager!.removeBundle(dialog.plugin.id))}><Icon name={busy ? 'loading' : 'trash'} size={16}/>确认卸载</button></div></>}
          {dialog.kind === 'update' && <><label className="store-field">选择稳定版本<select value={selectedVersion} onChange={e => setSelectedVersion(e.target.value)}>{dialog.versions.map(v => <option key={v.version} value={v.version}>{v.version}</option>)}</select></label><p className="store-field-note">更新由 Harness 官方管理器执行，结果和失败诊断会在这里显示。</p><div className="store-dialog-actions"><button className="store-button" disabled={busy} onClick={() => setDialog(null)}>取消</button><button className="store-button primary" disabled={busy} onClick={() => void run('正在更新插件', async () => { const requestId = crypto.randomUUID(); activeRequest.current = requestId; const response = await bridge.manager!.updateBundle(dialog.plugin.id, selectedVersion, { registry: dialog.registry, requestId }); if (response.restore && response.restore.application !== 'applied' && response.restore.application !== 'restart-required') throw new Error('更新失败，宿主恢复旧版本也失败了，请在原生管理器中检查。'); return response.result; })}><Icon name={busy ? 'loading' : 'refresh'} size={16}/>确认更新</button></div></>}
          {logs && <details className="store-logs" open><summary>宿主操作日志</summary><pre>{logs}</pre></details>}
        </>}
      </div>
    </dialog>}
  </div>;
}
