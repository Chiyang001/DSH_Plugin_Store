"""Resolve declared / exported / README logo resources, without substituting author avatars."""
import concurrent.futures, html, importlib.util, json, re, urllib.parse
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('collector', ROOT / 'scripts/collect-community.py')
collector = importlib.util.module_from_spec(spec); spec.loader.exec_module(collector)

def image(url):
    body = collector.get(url, 1_000_000)
    embedded = collector.icon_data(body, url)
    if embedded: return embedded
    # Preserve large original assets as URLs rather than degrading or replacing the artwork.
    if body.startswith((b'\x89PNG', b'\xff\xd8')) or (body[:4] == b'RIFF' and body[8:12] == b'WEBP'): return url
    if b'<svg' in body[:1500].lower() and not re.search(rb'<script|<foreignObject|\bon\w+\s*=', body, re.I): return url
    return None

def enrich(plugin):
    if plugin.get('logo') or not plugin.get('commit'): return plugin
    try:
        raw = plugin['url'].replace('https://github.com/', 'https://raw.githubusercontent.com/') + '/' + plugin['commit'] + '/'
        if plugin.get('packagePath'): raw += plugin['packagePath'].strip('/') + '/'
        pkg = collector.js(raw + 'package.json')
        candidates = []
        if isinstance(pkg.get('icon'), str): candidates.append((pkg['icon'], 'manifest'))
        exports = pkg.get('exports')
        if isinstance(exports, dict):
            for key, value in exports.items():
                if re.search(r'(?:^|/)(icon|logo)$', key) and isinstance(value, str): candidates.append((value, 'manifest'))
        for name in ['assets/logo.svg', 'assets/icon.png', 'logo.png', 'docs/icon.svg', 'static/logo.png', 'public/logo.svg']:
            candidates.append((name, 'repository'))
        try:
            readme = collector.get(raw + 'README.md').decode('utf8')
            for match in re.finditer(r'<img\b[^>]*>|!\[([^\]]*)\]\(([^\s)]+)(?:[^)]*)\)', readme, re.I):
                fragment = match.group(0)
                if match.group(2): url = match.group(2); alt = match.group(1)
                else:
                    src = re.search(r'\bsrc=["\']([^"\']+)', fragment, re.I)
                    if not src: continue
                    url = html.unescape(src.group(1)); alt = fragment
                if re.search(r'logo|(?:^|[/_.-])icon(?:[._/-]|$)|标志|图标', url + ' ' + alt, re.I) and not re.search(r'badge|shields\.io|avatars\.github|screenshot|banner|hero|readme/key|logo=|logoColor=', url, re.I):
                    candidates.insert(0, (url, 'repository'))
        except Exception: pass
        seen = set()
        for value, kind in candidates[:11]:
            if value.startswith('data:'): continue
            if value.startswith('https://github.com/') and '/blob/' in value: value = value.replace('https://github.com/', 'https://raw.githubusercontent.com/').replace('/blob/', '/')
            url = urllib.parse.urljoin(raw, value)
            if not url.startswith('https://') or url in seen: continue
            seen.add(url)
            try:
                logo = image(url)
                if logo:
                    plugin.update(logo=logo, logoSource=url, logoKind=kind)
                    return plugin
            except Exception: pass
    except Exception: pass
    return plugin

filename = ROOT / 'src/data/community.json'
data = json.loads(filename.read_text(encoding='utf8'))
with concurrent.futures.ThreadPoolExecutor(max_workers=20) as pool:
    data['plugins'] = list(pool.map(enrich, data['plugins']))
filename.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf8')
print(json.dumps({'plugins': len(data['plugins']), 'realLogos': sum(bool(p.get('logo')) for p in data['plugins']), 'remoteOriginals': sum(str(p.get('logo', '')).startswith('https:') for p in data['plugins'])}), flush=True)
