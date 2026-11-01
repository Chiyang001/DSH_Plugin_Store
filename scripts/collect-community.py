"""Collect public repository metadata and real package icons; never execute plugin code."""
import base64, concurrent.futures, datetime, json, pathlib, re, subprocess, urllib.parse, urllib.request

ROOT = pathlib.Path(__file__).resolve().parents[1]
OUT = ROOT / 'src' / 'data'
HEADERS = {'User-Agent': 'Harness-Plugin-Store/0.2', 'Accept': 'application/json'}
def get(url, limit=2_000_000):
    with urllib.request.urlopen(urllib.request.Request(url, headers=HEADERS), timeout=12) as response:
        body = response.read(limit + 1)
        if len(body) > limit: raise ValueError('Response too large')
        return body
def js(url): return json.loads(get(url))
def loc(value):
    if isinstance(value, str): return value
    if isinstance(value, dict): return value.get('zh') or value.get('zh-CN') or value.get('en') or ''
    return ''
def classify(text):
    text = text.lower()
    for pattern, category in [(r'memory|knowledge|context|retriev|rag|记忆|知识|上下文|搜索', 'knowledge'), (r'image|design|draw|slide|paint|wallpaper|创作|图像|绘图|设计|壁纸', 'creative'), (r'theme|sidebar|panel|ui-|界面|主题|面板', 'interface'), (r'mcp|telegram|feishu|wechat|qqbot|connect|integration|飞书|微信|集成|通知', 'integration'), (r'code|git|terminal|debug|agent|编程|开发|终端|工作树', 'coding')]:
        if re.search(pattern, text): return category
    return 'productivity'
STYLES = {'knowledge': ('purple', 'brain'), 'creative': ('pink', 'palette'), 'interface': ('cyan', 'layout'), 'integration': ('green', 'plug'), 'coding': ('blue', 'code'), 'productivity': ('amber', 'zap')}
def icon_data(body, url):
    if len(body) > 96_000: return None
    if body.startswith(b'\x89PNG'): mime = 'image/png'
    elif body.startswith(b'\xff\xd8'): mime = 'image/jpeg'
    elif body[:4] == b'RIFF' and body[8:12] == b'WEBP': mime = 'image/webp'
    elif b'<svg' in body[:1500].lower():
        text = body.decode('utf8', 'strict')
        if re.search(r'<script|<foreignObject|\bon\w+\s*=|(?:href\s*=\s*["\']\s*(?:https?:|javascript:))', text, re.I): return None
        mime = 'image/svg+xml'
    else: return None
    return f'data:{mime};base64,' + base64.b64encode(body).decode()
def collect(repo):
    full = repo['full_name']; branch = repo.get('default_branch', 'HEAD')
    try:
        raw_branch = f'https://raw.githubusercontent.com/{full}/{branch}/'
        pkg = js(raw_branch + 'package.json')
        if not isinstance(pkg.get('dsh', {}).get('bundle', {}).get('patch'), (str, list)): return None
        if not re.fullmatch(r'(?:@[\w.-]+/)?[\w.-]+', pkg.get('name', '')): return None
        remote = subprocess.run(['git', '-c', 'credential.interactive=false', 'ls-remote', f'https://github.com/{full}.git', 'HEAD' if branch == 'HEAD' else f'refs/heads/{branch}'], capture_output=True, text=True, timeout=22, creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
        sha = remote.stdout.split()[0] if remote.returncode == 0 and remote.stdout.split() else ''
        if not re.fullmatch(r'[a-f0-9]{40}', sha): return None
        raw = f'https://raw.githubusercontent.com/{full}/{sha}/'
        pkg = js(raw + 'package.json')
        if not pkg.get('dsh', {}).get('bundle', {}).get('patch'): return None
        meta = pkg.get('meta', {})
        for locale in ['locale/zh.json', 'locales/zh.json']:
            try:
                local = js(raw + locale).get('meta', {})
                if local: meta = {**meta, **local}; break
            except Exception: pass
        description = loc(meta.get('description')) or pkg.get('description') or repo.get('description') or '查看插件仓库了解功能与使用说明。'
        name = loc(meta.get('title')) or re.sub(r'^dsh-(?:plugin-)?', '', repo.get('name') or full.split('/')[1])
        category = classify(f'{pkg["name"]} {name} {description}')
        color, icon = STYLES[category]
        result = {'id': pkg['name'], 'name': name, 'description': description, 'author': full.split('/')[0], 'category': category,
                  'origin': 'github', 'url': f'https://github.com/{full}', 'spec': f'git+https://github.com/{full}.git#{sha}', 'commit': sha,
                  'version': pkg.get('version'), 'tags': [x for x in repo.get('topics', []) if x not in ['dsh-plugin', 'deepseek', 'deepseek-harness']][:4],
                  'color': color, 'icon': icon, 'verified': True, 'engines': pkg.get('engines', {}).get('dsh'), 'license': (pkg.get('license') if isinstance(pkg.get('license'), str) else None)}
        if isinstance(repo.get('stargazers_count'), int): result['stars'] = repo['stargazers_count']
        if repo.get('pushed_at'): result['updatedAt'] = repo['pushed_at']
        candidates = []
        declared = pkg.get('icon') or meta.get('icon')
        if isinstance(declared, str):
            if declared.startswith('data:image/') and len(declared) < 130_000: result.update(logo=declared, logoSource=raw + 'package.json', logoKind='manifest')
            elif declared.startswith('https://'): candidates.append((declared, 'manifest'))
            elif '..' not in declared.split('/') and not declared.startswith(('/', 'http:')): candidates.append((raw + declared.removeprefix('./'), 'manifest'))
        if not result.get('logo'):
            for filename in ['icon.svg', 'logo.svg', 'assets/icon.svg', 'assets/logo.png', 'icon.png']:
                candidates.append((raw + filename, 'repository'))
            for url, kind in candidates[:6]:
                try:
                    data = icon_data(get(url, 96_000), url)
                    if data: result.update(logo=data, logoSource=url, logoKind=kind); break
                except Exception: pass
        return result
    except Exception: return None

def main():
    repos = {}
    cache = ROOT / 'test-results/discovery-candidates.json'
    if cache.exists():
        for repo in json.loads(cache.read_text(encoding='utf-8-sig')).get('items', []): repos[repo['full_name']] = repo
    searches = ['topic:dsh-plugin dsh in:name archived:false fork:false', 'dsh-plugin in:name archived:false fork:false', 'topic:dsh-plugin archived:false fork:false']
    for index, query in enumerate(searches):
        try:
            data = js('https://api.github.com/search/repositories?q=' + urllib.parse.quote(query) + '&sort=stars&order=desc&per_page=100' + ('&page=2' if index == 2 else ''))
            for repo in data['items']: repos[repo['full_name']] = repo
        except Exception as error: print(f'Search note: {error}', flush=True)
    for full in ['Chiyang001/DSHAN_Plugin_P2P', 'Chiyang001/dsh-codsh-theme', 'dsh-external/dsh-session-search', 'dsh-external/dsh-memory-evolve']:
        repos.setdefault(full, {'full_name': full, 'name': full.split('/')[1], 'default_branch': 'HEAD'})
    print(f'Verifying {len(repos)} candidate repositories; no plugin code will execute.', flush=True)
    plugins = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=14) as pool:
        futures = [pool.submit(collect, repo) for repo in repos.values()]
        for index, task in enumerate(concurrent.futures.as_completed(futures), 1):
            item = task.result()
            if item: plugins.append(item)
            if index % 40 == 0: print(f'Checked {index}/{len(futures)}; valid bundles: {len(plugins)}', flush=True)
    previous = json.loads((OUT / 'community.json').read_text(encoding='utf8'))
    old = previous['plugins']
    by_id = {p['id']: p for p in old}
    for item in sorted(plugins, key=lambda p: p.get('stars', -1)):
        existing = by_id.get(item['id'])
        if existing and existing.get('url') != item.get('url'): continue
        by_id[item['id']] = {**(existing or {}), **item,
            'logo': item.get('logo') or (existing or {}).get('logo'),
            'logoSource': item.get('logoSource') or (existing or {}).get('logoSource'),
            'logoKind': item.get('logoKind') or (existing or {}).get('logoKind')}
    plugins = sorted(by_id.values(), key=lambda p: p.get('stars', -1), reverse=True)
    if len(plugins) < 15: raise RuntimeError('Too few valid bundles; keeping the existing snapshot.')
    payload = {**previous, 'fetchedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'candidateCount': max(previous.get('candidateCount', 0), len(repos)), 'strategy': previous.get('strategy', 'GitHub topic + repository-name searches; package manifest verified at fixed commit'), 'plugins': plugins}
    (OUT / 'community.json').write_text(json.dumps(payload, ensure_ascii=False, indent=2) + '\n', encoding='utf8')
    print(json.dumps({'verified': len(plugins), 'realLogos': sum(bool(p.get('logo')) for p in plugins), 'categories': {c: sum(p['category'] == c for p in plugins) for c in STYLES}}), flush=True)
if __name__ == '__main__': main()
