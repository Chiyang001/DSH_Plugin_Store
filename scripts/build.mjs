import { build } from 'esbuild';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
await mkdir('lib', { recursive: true });
const result = await build({ entryPoints: ['src/client.tsx'], outfile: 'lib/client.js', write: false, bundle: true, format: 'cjs', platform: 'browser', target: 'es2022', jsx: 'automatic', external: ['react', 'react/jsx-runtime'], loader: { '.css': 'text', '.png': 'dataurl' }, minify: true, legalComments: 'eof',
  define: { 'process.env.NODE_ENV': '"production"' },
  banner: { js: 'window.__ModuleLoader__.load({ id: "dsh-plugin-store", factory: (require) => { var module = { exports: {} }; var exports = module.exports;' },
  footer: { js: 'return module.exports; } });' },
});
// Publish a complete artifact in one rename so a live Host never reads a partial bundle.
await writeFile('lib/client.js.tmp', result.outputFiles[0].contents);
await rename('lib/client.js.tmp', 'lib/client.js');
const hostEntry = "export const name = 'chiyang-plugin-store';\nexport function apply() {}\n";
if (await readFile('lib/index.js', 'utf8').catch(() => '') !== hostEntry) {
  await writeFile('lib/index.js.tmp', hostEntry);
  await rename('lib/index.js.tmp', 'lib/index.js');
}
console.log('Built DSH bundle: lib/index.js + lib/client.js');
