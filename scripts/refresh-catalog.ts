import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { discoverGithub } from '../src/network';
import type { Plugin } from '../src/types';
const { plugins, warnings } = await discoverGithub();
if (!plugins.length) throw new Error(`未获取到有效插件，保留原目录。${warnings.join('\n')}`);
await mkdir('src/data', { recursive: true });
let previous: { plugins: Plugin[]; candidateCount?: number } = { plugins: [] };
try { previous = JSON.parse(await readFile('src/data/community.json', 'utf8')); } catch {}
const catalog = new Map(previous.plugins.map(p => [p.id, p]));
for (const p of plugins) { const old = catalog.get(p.id); catalog.set(p.id, { ...old, ...p, logo: p.logo || old?.logo, logoSource: p.logoSource || old?.logoSource }); }
await writeFile('src/data/community.json', JSON.stringify({ ...previous, fetchedAt: new Date().toISOString(), plugins: [...catalog.values()] }, null, 2) + '\n');
console.log(`已更新 ${plugins.length} 个插件，完整目录保留 ${catalog.size} 个插件。`);
if (warnings.length) console.log(warnings.join('\n'));
