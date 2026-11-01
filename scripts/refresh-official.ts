import { readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { classify, categories } from '../src/model';
import type { Plugin } from '../src/types';
const root = process.argv[2];
if (!root) throw new Error('用法：tsx scripts/refresh-official.ts <official-repository-checkout>');
const plugins: Plugin[] = [];
for (const entry of await readdir(join(root, 'packages/experimental'))) {
  try {
    const dir = join(root, 'packages/experimental', entry);
    const pkg = JSON.parse(await readFile(join(dir, 'package.json'), 'utf8'));
    if (!pkg.dsh?.bundle?.patch) continue;
    const locale = JSON.parse(await readFile(join(dir, 'locale/zh.json'), 'utf8')).meta;
    if (!locale?.title || !locale?.description) continue;
    const category = classify(`${pkg.name} ${locale.title} ${locale.description}`);
    const style = categories.find(c => c.id === category)!;
    let logo: string | undefined;
    if (typeof pkg.icon === 'string' && !pkg.icon.startsWith('http')) {
      try { const file = await readFile(join(dir, pkg.icon)); if (file.length <= 96000) logo = `data:image/${pkg.icon.endsWith('.svg') ? 'svg+xml' : pkg.icon.endsWith('.png') ? 'png' : 'webp'};base64,${file.toString('base64')}`; } catch {}
    }
    plugins.push({ id: pkg.name, name: locale.title, description: locale.description, author: 'DeepSeek', category, logo,
      logoKind: logo ? 'manifest' : undefined,
      logoSource: logo ? `https://github.com/deepseek-ai/deepseek-harness/blob/ce7073d51254c26cd63b22a60835b8f948deb447/packages/experimental/${entry}/${pkg.icon.replace(/^\.\//, '')}` : undefined,
      origin: 'official', url: `https://github.com/deepseek-ai/deepseek-harness/tree/master/packages/experimental/${entry}`,
      tags: ['官方实验插件'], color: style.color, icon: style.icon, featured: ['session-search', 'terminal-bundle'].includes(entry), verified: true });
  } catch { /* Packages without bundle metadata do not belong to this preview catalog. */ }
}
const { OFFICIAL_ON_DEMAND_CATALOG } = await import(pathToFileURL(join(root, 'packages/util/official-bundles/src/catalog.generated.ts')).href);
for (const entry of OFFICIAL_ON_DEMAND_CATALOG) {
  if (entry.platforms?.length && !entry.platforms.includes('win32')) continue;
  const category = classify(entry.packageName); const style = categories.find(c => c.id === category)!;
  plugins.push({ id: entry.packageName, name: entry.meta.title.zh || entry.meta.title.en, description: entry.meta.description.zh || entry.meta.description.en,
    author: 'DeepSeek', origin: 'official', category, color: style.color, icon: style.icon,
    logo: entry.meta.icon, logoKind: 'manifest', tags: ['官方扩展'], url: 'https://github.com/deepseek-ai/deepseek-harness', verified: true });
}
await writeFile('src/data/official.json', JSON.stringify({ source: 'deepseek-ai/deepseek-harness', fetchedAt: new Date().toISOString(), plugins }, null, 2) + '\n');
console.log(`已提取 ${plugins.length} 个官方插件，仅作为独立预览目录；原生模式从 Host 读取。`);
