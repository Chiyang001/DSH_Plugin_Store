import type { Bundle, Category, Localized, Plugin } from './types';
import { satisfies, valid, validRange } from 'semver';
export const categories: { id: Category; name: string; icon: string; description: string; color: string }[] = [
  { id: 'all', name: '全部插件', icon: 'grid', description: '探索更多可能', color: 'blue' },
  { id: 'coding', name: '开发工具', icon: 'code', description: '让构建更加得心应手', color: 'blue' },
  { id: 'productivity', name: '效率提升', icon: 'zap', description: '把时间留给重要的事', color: 'amber' },
  { id: 'knowledge', name: '知识与记忆', icon: 'brain', description: '让每一次思考都有积累', color: 'purple' },
  { id: 'creative', name: '创作与设计', icon: 'palette', description: '给灵感一个新的出口', color: 'pink' },
  { id: 'integration', name: '连接与集成', icon: 'plug', description: '连接你的工具与工作流', color: 'green' },
  { id: 'interface', name: '界面与体验', icon: 'layout', description: '打造属于你的工作空间', color: 'cyan' },
  { id: 'models', name: '模型与推理', icon: 'brain', description: '为每一种任务选择合适的智能', color: 'violet' },
  { id: 'automation', name: '自动化工作流', icon: 'sparkles', description: '让重复的工作自己运行', color: 'coral' },
  { id: 'data', name: '数据与洞察', icon: 'chart', description: '看清用量、成本与运行表现', color: 'teal' },
];
export function localize(value?: Localized): string {
  return typeof value === 'string' ? value : value?.zh ?? value?.['zh-CN'] ?? value?.en ?? Object.values(value ?? {})[0] ?? '';
}
export function classify(text: string): Category {
  const t = text.toLowerCase();
  if (/token|tracing|analytics|statistics|usage.stats|cost|用量|统计|成本|追踪|数据分析/.test(t)) return 'data';
  if (/model.routing|llm.fallback|model.switch|模型切换|模型路由|推理|模型提供|免费模型|模型聚合/.test(t)) return 'models';
  if (/workflow|schedule|cron|automation|自动化|定时|任务编排|工作流/.test(t)) return 'automation';
  if (/memory|knowledge|context|search|retriev|记忆|知识|搜索|上下文|rag/.test(t)) return 'knowledge';
  if (/image|design|draw|slide|创作|图像|绘图|设计/.test(t)) return 'creative';
  if (/ui-|theme|panel|desktop|sidebar|界面|主题|面板/.test(t)) return 'interface';
  if (/mcp|telegram|api|connect|integration|飞书|微信|集成/.test(t)) return 'integration';
  if (/code|git|terminal|debug|coding|开发|编程|agent/.test(t)) return 'coding';
  return 'productivity';
}
export function bundlePlugin(b: Bundle): Plugin {
  const isOfficial = b.official || b.name.startsWith('@deepseek-ai/');
  const category = classify(`${b.name} ${localize(b.meta?.title)} ${localize(b.meta?.description)}`);
  const style = categories.find(c => c.id === category)!;
  return { id: b.name, name: localize(b.meta?.title) || b.name.replace('@deepseek-ai/dsh-', ''),
    description: localize(b.meta?.description) || b.description || '来自当前 Harness 配置的插件。',
    author: isOfficial ? 'DeepSeek' : b.name.split('/')[0].replace('@', ''), category,
    origin: isOfficial ? 'official' : 'github', url: isOfficial ? 'https://github.com/deepseek-ai/deepseek-harness' : repositoryUrl(b.source),
    spec: b.installTarget?.spec, version: b.version ?? b.installTarget?.version,
    tags: [isOfficial ? '官方插件' : '已安装'], color: style.color, icon: style.icon, verified: true,
    logo: safeLogo(b.meta?.icon), logoKind: b.meta?.icon ? 'host' : undefined };
}
export function repositoryUrl(source?: string): string {
  const match = source?.match(/(?:github:|github\.com[/:])([\w.-]+\/[\w.-]+)/);
  return match ? `https://github.com/${match[1].replace(/\.git$/, '')}` : '';
}
export function mergeCatalog(plugins: Plugin[], bundles: Bundle[]): Plugin[] {
  const map = new Map(plugins.map(p => [p.id, p]));
  for (const b of bundles) {
    if (b.listedByDefault === false && !b.enabled && !b.installed) continue;
    const old = map.get(b.name);
    const host = bundlePlugin(b);
    map.set(b.name, old ? { ...old, ...host, name: localize(b.meta?.title) || old.name,
      description: localize(b.meta?.description) || b.description || old.description,
      author: old.author, origin: host.origin === 'official' ? 'official' : old.origin, url: old.url || host.url, spec: host.spec || old.spec,
      logo: host.logo || old.logo, logoSource: host.logo ? undefined : old.logoSource,
      logoKind: host.logo ? 'host' : old.logoKind, featured: old.featured } : host);
  }
  return [...map.values()];
}
export function isOfficialPlugin(plugin: Plugin): boolean {
  return plugin.origin === 'official' || plugin.id.startsWith('@deepseek-ai/');
}
export function filterPlugins(plugins: Plugin[], options: { query: string; category: Category; origin: string; sort: string; hideOfficial?: boolean }): Plugin[] {
  const normalize = (s: string) => s.normalize('NFKC').toLowerCase();
  const aliases: Record<string, string[]> = {
    '记忆': ['memory', 'mnemon', 'context'], '搜索': ['search', 'retrieval'], '翻译': ['translate', 'translation'],
    '截图': ['screenshot', 'screen capture'], '语音': ['voice', 'speech', 'tts', 'audio'], '终端': ['terminal', 'shell'],
    '图片': ['image', 'vision'], '绘图': ['drawing', 'image-gen', 'image generation'], '模型': ['model', 'llm', 'provider'],
    '工作流': ['workflow', 'automation'], '自动化': ['automation', 'workflow', 'schedule'], '统计': ['stats', 'analytics', 'usage'],
    '主题': ['theme', 'wallpaper'], '通知': ['notification', 'notify'], '浏览器': ['browser', 'playwright'], '数据库': ['database', 'sql'],
  };
  const terms = normalize(options.query.trim()).split(/[\s,，、;；]+/).filter(Boolean).map(term => [term, ...aliases[term] ?? []]);
  const textOf = (p: Plugin) => normalize([p.name, p.description, p.author, p.id, p.tags.join(' '), p.url, p.sourceName,
    categories.find(c => c.id === p.category)?.name, p.category, p.origin === 'official' ? '官方 official' : '社区 community'].filter(Boolean).join(' '));
  const relevance = (p: Plugin) => terms.reduce((score, variants) => score + (variants.some(v => normalize(p.name).includes(v)) ? 12 : variants.some(v => normalize(p.id).includes(v)) ? 8 : variants.some(v => normalize(p.author).includes(v)) ? 4 : 1), 0);
  return plugins.filter(p => (!terms.length || terms.every(variants => variants.some(term => textOf(p).includes(term))))
    && (!options.hideOfficial || !isOfficialPlugin(p))
    && (options.category === 'all' || p.category === options.category) && (options.origin === 'all' || p.origin === options.origin))
    .sort((a, b) => Number(isOfficialPlugin(a)) - Number(isOfficialPlugin(b)) || (options.sort === 'stars' ? (b.stars ?? -1) - (a.stars ?? -1)
      : options.sort === 'newest' ? (b.updatedAt ?? '').localeCompare(a.updatedAt ?? '')
      : relevance(b) - relevance(a) || Number(!!b.featured) - Number(!!a.featured) || Number(!!b.logo) - Number(!!a.logo) || (b.stars ?? 0) - (a.stars ?? 0)));
}
/** Rotate community results without promoting official entries from the tail. */
export function catalogBatch(plugins: Plugin[], batch: number): Plugin[] {
  const community = plugins.filter(p => !isOfficialPlugin(p));
  const official = plugins.filter(isOfficialPlugin);
  const offset = community.length ? (batch * Math.min(24, Math.max(1, Math.floor(community.length / 2)))) % community.length : 0;
  return [...community.slice(offset), ...community.slice(0, offset), ...official];
}
export function outcome(result: import('./types').ChangeResult): { ok: boolean; message: string } {
  if (result.application === 'applied') return { ok: true, message: '操作成功，已在 Harness 中生效。' };
  if (result.application === 'restart-required') return { ok: true, message: '更改已保存，重启 DeepSeek Harness 后生效。' };
  if (result.application === 'overridden') return { ok: false, message: '更改已保存，但被其他配置覆盖，请在原生插件管理中检查。' };
  if (result.application === 'cancelled') return { ok: false, message: '操作已取消。' };
  return { ok: false, message: result.error?.reason || result.packageResult?.output || result.error?.code || '操作失败，请查看安装日志。' };
}
/** Keep SVG isolated inside img resources, never inline repository markup. */
export function safeLogo(value?: unknown): string | undefined {
  if (typeof value !== 'string' || value.length > 160_000) return undefined;
  if (/^data:image\/(?:png|jpeg|webp|svg\+xml);base64,[a-zA-Z0-9+/=\s]+$/.test(value)) return value;
  try { const url = new URL(value); if (url.protocol === 'https:' && !url.username && !url.password) return url.href; } catch {}
  return undefined;
}
export function shanghaiDay(now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const part = (key: string) => parts.find(p => p.type === key)?.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}
function hash(text: string): number { let value = 2166136261; for (let i = 0; i < text.length; i++) value = Math.imul(value ^ text.charCodeAt(i), 16777619); return value >>> 0; }
export function pluginCompatibility(plugin: Plugin, runtimeVersion?: string): 'compatible' | 'incompatible' | 'unknown' {
  if (typeof runtimeVersion !== 'string' || typeof plugin.engines !== 'string' || !valid(runtimeVersion) || !validRange(plugin.engines)) return 'unknown';
  return satisfies(runtimeVersion, plugin.engines, { includePrerelease: true }) ? 'compatible' : 'incompatible';
}
export function dailyRecommendations(plugins: Plugin[], day: string, limit = 6, runtimeVersion?: string, batch = 0): Plugin[] {
  const referenceTime = Date.parse(`${day}T12:00:00+08:00`);
  const candidates = plugins.filter(p => !isOfficialPlugin(p) && p.verified && !!p.spec)
    .filter(p => pluginCompatibility(p, runtimeVersion) !== 'incompatible')
    .filter(p => !/purge|jailbreak|free-model|绕过|破甲/i.test(`${p.id} ${p.description}`))
    .map(p => ({ plugin: p, rank: hash(batch ? `${day}:${batch}:${p.id}` : `${day}:${p.id}`) / 0xffffffff + (p.logo ? .08 : 0) + (p.featured ? .1 : 0)
      + (p.updatedAt && referenceTime - Date.parse(p.updatedAt) < 90 * 86400000 ? .1 : 0) }))
    .sort((a, b) => Number(!!b.plugin.logo) - Number(!!a.plugin.logo) || b.rank - a.rank);
  const selected: Plugin[] = []; const seenCategories = new Set<Category>();
  const add = (p: Plugin) => { if (!selected.some(s => s.id === p.id)) { selected.push(p); seenCategories.add(p.category); } };
  const community = candidates.find(c => c.plugin.origin === 'github'); if (community) add(community.plugin);
  for (const { plugin } of candidates) { if (selected.length >= limit) break; if (!seenCategories.has(plugin.category)) add(plugin); }
  for (const { plugin } of candidates) { if (selected.length >= limit) break; add(plugin); }
  return selected.slice(0, limit);
}
export function recommendationReason(plugin: Plugin): string {
  if (plugin.origin === 'official') return '从官方维护的能力开始，版本与宿主保持一致';
  if (plugin.featured) return '精选工具，适合加入你的日常工作流';
  if ((plugin.stars ?? 0) >= 100) return '社区关注较多，值得了解它能解决的问题';
  return `${categories.find(c => c.id === plugin.category)?.name ?? '社区'}领域的新发现，给工作流一个新选择`;
}
