import { categories, classify, localize, safeLogo } from './model';
import type { Plugin } from './types';
const MAX_BYTES = 2 * 1024 * 1024;
export function httpsUrl(raw: string): string {
  const url = new URL(raw);
  if (url.protocol !== 'https:' || url.username || url.password || url.hash) throw new Error('请输入不含账号、密码或片段的 HTTPS 地址。');
  return url.href;
}
export async function fetchJson(url: string, signal?: AbortSignal, options: { maxBytes?: number } = {}): Promise<any> {
  const maxBytes = options.maxBytes ?? MAX_BYTES;
  const response = await fetch(url, { signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(15000)]) : AbortSignal.timeout(15000), credentials: 'omit', redirect: 'error', headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error(response.status === 403 || response.status === 429 ? '源请求受到限流，请稍后重试。' : `请求失败：HTTP ${response.status}`);
  const reader = response.body?.getReader();
  if (!reader) throw new Error('源返回了空响应。');
  const chunks: Uint8Array[] = []; let length = 0;
  try {
    while (true) { const { done, value } = await reader.read(); if (done) break; length += value.length; if (length > maxBytes) throw new Error(`索引超过 ${maxBytes / 1024 / 1024} MB 大小限制。`); chunks.push(value); }
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
  const all = new Uint8Array(length); let offset = 0;
  for (const chunk of chunks) { all.set(chunk, offset); offset += chunk.length; }
  return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(all));
}
export interface GithubDiscoveryOptions {
  /** Rotate search pages without increasing the per-run verification budget. */
  page?: number;
}
export interface GithubDiscoveryResult {
  plugins: Plugin[];
  warnings: string[];
  /** Unique candidate repositories whose manifests were inspected. */
  scanned: number;
  /** Search routes attempted, including routes that failed independently. */
  searches: number;
}
const GITHUB_DISCOVERY_QUERIES = [
  { label: 'GitHub 插件主题', query: 'topic:dsh-plugin archived:false fork:false', sort: 'stars' },
  { label: 'GitHub 插件名称', query: 'dsh-plugin in:name archived:false fork:false', sort: 'stars' },
  { label: '中文插件关键词', query: '"DeepSeek Harness" 插件 in:description archived:false fork:false', sort: 'stars' },
  { label: '近期维护的社区项目', query: '"DeepSeek Harness" plugin in:description archived:false fork:false', sort: 'updated' },
] as const;
function isBundleManifest(value: any): boolean {
  const patch = value?.dsh?.bundle?.patch;
  return typeof value?.name === 'string' && /^(?:@[a-z0-9._-]+\/)?[a-z0-9._-]+$/.test(value.name)
    && (typeof patch === 'string' && !!patch.trim() || Array.isArray(patch) && patch.length > 0 && patch.every(p => typeof p === 'string' && !!p.trim()));
}
/** Four complementary searches, fairly interleaved into at most 32 candidate checks. */
export async function discoverGithub(signal?: AbortSignal, options: GithubDiscoveryOptions = {}): Promise<GithubDiscoveryResult> {
  signal?.throwIfAborted();
  const page = Number.isInteger(options.page) && options.page! > 0 ? Math.min(options.page!, 10) : 1;
  const warnings: string[] = [];
  const searches = await Promise.all(GITHUB_DISCOVERY_QUERIES.map(async route => {
    const url = new URL('https://api.github.com/search/repositories');
    url.search = new URLSearchParams({ q: route.query, sort: route.sort, order: 'desc', per_page: '24', page: String(page) }).toString();
    try {
      const data = await fetchJson(url.href, signal);
      if (!Array.isArray(data?.items)) throw new Error('GitHub 返回了无效的仓库列表。');
      return { items: data.items as any[], warning: undefined };
    } catch (error) {
      if (signal?.aborted) throw error;
      return { items: [] as any[], warning: `${route.label}：${error instanceof Error ? error.message : String(error)}` };
    }
  }));
  for (const search of searches) if (search.warning) warnings.push(search.warning);
  // Round-robin selection prevents a large popular query from crowding out other routes.
  const candidates: any[] = []; const seenRepositories = new Set<string>();
  const largestPage = Math.max(0, ...searches.map(search => search.items.length));
  for (let row = 0; row < largestPage && candidates.length < 32; row++) {
    for (const search of searches) {
      const repo = search.items[row];
      if (typeof repo?.full_name !== 'string' || !/^[\w.-]+\/[\w.-]+$/.test(repo.full_name)
        || typeof repo.default_branch !== 'string' || !repo.default_branch || repo.archived || repo.fork) continue;
      const key = repo.full_name.toLowerCase();
      if (seenRepositories.has(key)) continue;
      seenRepositories.add(key); candidates.push(repo);
      if (candidates.length === 32) break;
    }
  }
  const plugins = new Map<string, Plugin>();
  // Only verified bundle candidates need a commit lookup: at most 4 + 32 API calls.
  // Raw manifest requests do not consume the GitHub REST core-request budget.
  for (let offset = 0; offset < candidates.length; offset += 4) {
    signal?.throwIfAborted();
    const batch = await Promise.all(candidates.slice(offset, offset + 4).map(async repo => {
      try {
        const branchManifest = await fetchJson(`https://raw.githubusercontent.com/${repo.full_name}/${encodeURIComponent(repo.default_branch)}/package.json`, signal);
        if (!isBundleManifest(branchManifest)) return {};
        const commit = await fetchJson(`https://api.github.com/repos/${repo.full_name}/commits/${encodeURIComponent(repo.default_branch)}`, signal);
        if (typeof commit?.sha !== 'string' || !/^[a-f0-9]{40}$/.test(commit.sha)) throw new Error('仓库提交标识无效。');
        const manifest = await fetchJson(`https://raw.githubusercontent.com/${repo.full_name}/${commit.sha}/package.json`, signal);
        if (!isBundleManifest(manifest)) return {};
        const topics: string[] = Array.isArray(repo.topics) ? repo.topics.filter((t: unknown): t is string => typeof t === 'string') : [];
        const description = typeof repo.description === 'string' ? repo.description : '';
        const category = classify(`${repo.name ?? ''} ${description} ${topics.join(' ')}`);
        const style = categories.find(c => c.id === category)!;
        const plugin: Plugin = { id: manifest.name, name: localize(manifest.meta?.title) || String(repo.name || repo.full_name.split('/')[1]).replace(/^dsh-(?:plugin-)?/, ''),
          description: localize(manifest.meta?.description) || (typeof manifest.description === 'string' ? manifest.description : '') || description || '查看仓库了解插件功能。',
          author: typeof repo.owner?.login === 'string' ? repo.owner.login : repo.full_name.split('/')[0], category, origin: 'github', url: `https://github.com/${repo.full_name}`,
          spec: `git+https://github.com/${repo.full_name}.git#${commit.sha}`, commit: commit.sha,
          version: typeof manifest.version === 'string' ? manifest.version : undefined,
          stars: typeof repo.stargazers_count === 'number' && Number.isFinite(repo.stargazers_count) ? repo.stargazers_count : undefined,
          updatedAt: typeof repo.pushed_at === 'string' ? repo.pushed_at : undefined,
          tags: topics.filter(t => t !== 'dsh-plugin').slice(0, 3), color: style.color, icon: style.icon, verified: true,
          logo: safeLogo(manifest.icon) || (typeof manifest.icon === 'string' && /^(?:\.\/)?[\w./-]+\.(?:svg|png|webp|jpe?g)$/i.test(manifest.icon) && !manifest.icon.split('/').includes('..') ? `https://raw.githubusercontent.com/${repo.full_name}/${commit.sha}/${manifest.icon.replace(/^\.\//, '')}` : undefined),
          logoKind: 'manifest', logoSource: `https://github.com/${repo.full_name}/blob/${commit.sha}/package.json`,
          engines: typeof manifest.engines?.dsh === 'string' ? manifest.engines.dsh : undefined,
          license: typeof manifest.license === 'string' ? manifest.license : undefined };
        return { plugin };
      } catch (error) {
        if (signal?.aborted) throw error;
        return { warning: `${repo.full_name}: ${error instanceof Error ? error.message : String(error)}` };
      }
    }));
    for (const result of batch) {
      if (result.warning) warnings.push(result.warning);
      if (result.plugin) {
        const previous = plugins.get(result.plugin.id);
        if (!previous || (result.plugin.stars ?? 0) > (previous.stars ?? 0)) plugins.set(result.plugin.id, result.plugin);
      }
    }
  }
  return { plugins: [...plugins.values()].sort((a, b) => (b.stars ?? 0) - (a.stars ?? 0)), warnings, scanned: candidates.length, searches: searches.length };
}
export function parseIndex(data: any, sourceName: string, indexUrl?: string): Plugin[] {
  if (data?.format !== 1 || !Array.isArray(data.plugins)) throw new Error('索引需要使用 DSH format: 1 格式。');
  if (data.plugins.length > 5000) throw new Error('每个索引最多支持 5000 个插件。');
  return data.plugins.map((p: any) => {
    if (typeof p.name !== 'string' || !Array.isArray(p.versions) || !p.versions.length) throw new Error('索引包含缺少名称或版本的插件。');
    const v = p.versions[0]; let spec: string; let registry: string | undefined;
    if (typeof v.version !== 'string') throw new Error('版本号无效。');
    if (v.source?.type === 'npm') {
      if (!/^(?:@[a-z0-9._-]+\/)?[a-z0-9._-]+$/.test(p.name) || !/^\d+\.\d+\.\d+(?:-[\w.-]+)?$/.test(v.version)) throw new Error('npm 包名称或版本号无效。');
      spec = `${p.name}@${v.version}`;
      // Retain the exact declared registry through inspection and installation.
      if (v.source.registry) registry = httpsUrl(v.source.registry);
    } else if (v.source?.type === 'git') {
      const url = httpsUrl(v.source.url);
      if (!/^[a-f0-9]{40}$/i.test(v.source.commit)) throw new Error('Git 来源必须固定到完整的 40 位提交。');
      spec = `git+${url}${url.endsWith('.git') ? '' : '.git'}#${v.source.commit}`;
      if (v.source.path) {
        if (!/^\/?[\w./-]+$/.test(v.source.path) || v.source.path.split('/').includes('..')) throw new Error('Git 子目录无效。');
        spec += `&path:/${v.source.path.replace(/^\/+/, '')}`;
      }
    } else throw new Error('索引来源必须是 npm 或 git。');
    const keywords = Array.isArray(p.metadata?.keywords) ? p.metadata.keywords.filter((t: unknown) => typeof t === 'string') : [];
    const category = classify(`${p.name} ${localize(p.title)} ${localize(p.description)} ${keywords.join(' ')}`);
    const style = categories.find(c => c.id === category)!;
    return { id: p.name, name: localize(p.title) || p.name, description: localize(p.description),
      author: typeof p.author === 'string' ? p.author : p.author?.name || sourceName, category,
      origin: 'index', sourceName, url: p.homepage ? httpsUrl(p.homepage) : '', spec, version: v.version,
      registry,
      tags: keywords.slice(0, 4), color: style.color, icon: style.icon,
      logo: safeLogo(p.icon) || (typeof p.icon === 'string' && indexUrl ? safeLogo(new URL(p.icon, indexUrl).href) : undefined), logoKind: 'index', logoSource: indexUrl,
      engines: typeof v.engines?.dsh === 'string' ? v.engines.dsh : undefined,
    };
  });
}
