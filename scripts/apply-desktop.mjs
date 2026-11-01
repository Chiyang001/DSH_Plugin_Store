import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Offline local-link installation. Does not run a package manager or copy backups.
const source = fs.realpathSync(path.resolve(fileURLToPath(new URL('..', import.meta.url))));
const profile = fs.realpathSync(path.resolve(process.argv[2] || path.join(process.env.USERPROFILE, '.dsh/profiles/desktop')));
const dryRun = process.argv.includes('--dry-run');
const pkg = JSON.parse(fs.readFileSync(path.join(source, 'package.json'), 'utf8'));
if (pkg.name !== 'dsh-plugin-store' || !pkg.dsh?.bundle?.patch) throw new Error('Invalid store bundle.');
for (const filename of ['lib/index.js', 'lib/client.js', 'cordis.patch.yml']) {
  if (!fs.statSync(path.join(source, filename)).isFile()) throw new Error(`Missing artifact: ${filename}`);
}
const manifestPath = path.join(profile, 'package.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
if (!Array.isArray(manifest.dsh?.profile?.bundles)) throw new Error('Target is not an initialized DSH profile.');
if (fs.existsSync(manifestPath + '.lock')) throw new Error('A profile operation holds package.json.lock. Wait for it to finish.');
const target = path.join(profile, 'node_modules', pkg.name);
if (fs.existsSync(target) && fs.realpathSync(target).toLowerCase() !== source.toLowerCase()) throw new Error('An unrelated installation already occupies the target.');
const relative = path.relative(profile, source).replaceAll('\\', '/');
const spec = `link:${relative}`;
const writes = [];
for (const lockPath of [path.join(profile, 'pnpm-lock.yaml'), path.join(profile, 'node_modules/.pnpm/lock.yaml')]) {
  if (!fs.existsSync(lockPath)) continue;
  const content = fs.readFileSync(lockPath, 'utf8');
  const newline = content.includes('\r\n') ? '\r\n' : '\n';
  const marker = /(importers:\r?\n(?:\r?\n)*  \.:\r?\n    dependencies:\r?\n)/;
  if (!marker.test(content)) throw new Error(`Unsupported lockfile layout: ${lockPath}`);
  const ownEntry = /^      dsh-plugin-store:\r?\n(?:        [^\r\n]*\r?\n)*/m;
  const entry = `      dsh-plugin-store:${newline}        specifier: ${JSON.stringify(spec)}${newline}        version: ${JSON.stringify(spec)}${newline}`;
  const updated = ownEntry.test(content) ? content.replace(ownEntry, entry) : content.replace(marker, '$1' + entry);
  if (updated !== content) writes.push([lockPath, updated]);
}
manifest.dependencies ??= {};
manifest.dependencies[pkg.name] = spec;
if (!manifest.dsh.profile.bundles.includes(pkg.name)) manifest.dsh.profile.bundles.push(pkg.name);
writes.push([manifestPath, JSON.stringify(manifest, null, 2) + '\n']);
console.log(JSON.stringify({ profile, source, link: target, spec, writeFiles: writes.map(([file]) => file), dryRun }, null, 2));
if (!dryRun) {
  if (!fs.existsSync(target)) fs.symlinkSync(source, target, process.platform === 'win32' ? 'junction' : 'dir');
  for (const [file, content] of writes) fs.writeFileSync(file, content, 'utf8');
  const entry = fs.realpathSync(path.join(target, 'lib/index.js'));
  console.log(`Installed local bundle ${pkg.name}@${pkg.version}: ${entry}`);
}
