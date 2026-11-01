import { readFile, writeFile } from 'node:fs/promises';
import { categories, classify } from '../src/model';
import type { Plugin } from '../src/types';

for (const filename of ['src/data/community.json', 'src/data/official.json']) {
  const data = JSON.parse(await readFile(filename, 'utf8'));
  for (const plugin of data.plugins as Plugin[]) {
    const category = classify(`${plugin.id} ${plugin.name} ${plugin.description}`);
    const style = categories.find(c => c.id === category)!;
    plugin.category = category; plugin.color = style.color; plugin.icon = style.icon;
  }
  await writeFile(filename, JSON.stringify(data, null, 2) + '\n');
  console.log(JSON.stringify({ file: filename, plugins: data.plugins.length, logos: data.plugins.filter((p: Plugin) => !!p.logo).length, categories: Object.fromEntries(categories.filter(c => c.id !== 'all').map(c => [c.name, data.plugins.filter((p: Plugin) => p.category === c.id).length])) }));
}
