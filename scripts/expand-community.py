"""Broader, reproducible discovery of real DeepSeek Harness bundle packages.

Uses public metadata only. It never installs a dependency or executes plugin code.
Existing entries and their artwork are retained when a source is unavailable.
"""
import argparse, concurrent.futures, datetime, gzip, importlib.util, json, pathlib, re, subprocess, time, urllib.parse, urllib.request

ROOT = pathlib.Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('collector', ROOT / 'scripts/collect-community.py')
collector = importlib.util.module_from_spec(spec); spec.loader.exec_module(collector)
HEADERS = {'User-Agent': 'Harness-Plugin-Store/0.3', 'Accept': 'application/vnd.github+json', 'Accept-Encoding': 'gzip'}
def get(url, limit=2_500_000, timeout=10):
    with urllib.request.urlopen(urllib.request.Request(url, headers=HEADERS), timeout=timeout) as response:
        value = response.read(limit + 1)
        if response.headers.get('Content-Encoding') == 'gzip': value = gzip.decompress(value)
        if len(value) > limit: raise ValueError('resource too large')
        return value
def js(url, timeout=10): return json.loads(get(url, timeout=timeout))
def safe_path(value):
    return isinstance(value, str) and bool(re.fullmatch(r'[\w./-]+', value)) and not value.startswith('/') and '..' not in value.split('/')
def valid_manifest(pkg):
    if not isinstance(pkg, dict) or not re.fullmatch(r'(?:@[a-zA-Z0-9._-]+/)?[a-zA-Z0-9._-]+', str(pkg.get('name', ''))): return False
    dsh = pkg.get('dsh'); bundle = dsh.get('bundle') if isinstance(dsh, dict) else None
    patches = bundle.get('patch') if isinstance(bundle, dict) else None
    return (isinstance(patches, str) and safe_path(patches)) or (isinstance(patches, list) and bool(patches) and all(safe_path(p) for p in patches))
def normalize_path(value): return value.removeprefix('./').strip('/')
def pinned_sha(repo):
    branch = repo.get('default_branch', 'HEAD')
    result = subprocess.run(['git', '-c', 'credential.interactive=false', 'ls-remote', 'https://github.com/' + repo['full_name'] + '.git', 'HEAD' if branch == 'HEAD' else 'refs/heads/' + branch], text=True, capture_output=True, timeout=18, creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
    value = result.stdout.split()[0] if result.returncode == 0 and result.stdout.split() else ''
    return value if re.fullmatch(r'[a-f0-9]{40}', value) else None
def make_plugin(repo, sha, pkg, directory=''):
    full = repo['full_name']; relative = normalize_path(directory)
    raw_root = f'https://raw.githubusercontent.com/{full}/{sha}/'
    raw = raw_root + (relative + '/' if relative else '')
    meta = pkg.get('meta') if isinstance(pkg.get('meta'), dict) else {}
    # One canonical locale fetch avoids probing many missing files for every candidate.
    try:
        local = js(raw + 'locale/zh.json', timeout=4).get('meta', {})
        if isinstance(local, dict): meta = {**meta, **local}
    except Exception: pass
    description = collector.loc(meta.get('description')) or pkg.get('description') or repo.get('description') or '查看插件仓库了解功能与使用说明。'
    title = collector.loc(meta.get('title')) or pkg['name'].split('/')[-1].removeprefix('dsh-plugin-').removeprefix('dsh-')
    category = collector.classify(pkg['name'] + ' ' + title + ' ' + str(description)); color, icon = collector.STYLES[category]
    install_spec = f'git+https://github.com/{full}.git#{sha}' + (f'&path:/{relative}' if relative else '')
    value = {'id': pkg['name'], 'name': title, 'description': str(description), 'author': full.split('/')[0], 'category': category, 'origin': 'github',
        'url': 'https://github.com/' + full, 'spec': install_spec, 'commit': sha, 'version': pkg.get('version'), 'tags': [t for t in repo.get('topics', []) if t not in ['dsh-plugin', 'deepseek', 'deepseek-harness']][:4],
        'color': color, 'icon': icon, 'verified': True, 'manifestPath': (relative + '/' if relative else '') + 'package.json', 'discoverySource': repo.get('discoverySource', 'GitHub repository search')}
    if relative: value['packagePath'] = relative
    engines = pkg.get('engines')
    if isinstance(engines, dict) and isinstance(engines.get('dsh'), str): value['engines'] = engines['dsh']
    if isinstance(pkg.get('license'), str): value['license'] = pkg['license']
    if isinstance(repo.get('stargazers_count'), int): value['stars'] = repo['stargazers_count']
    if repo.get('pushed_at'): value['updatedAt'] = repo['pushed_at']
    declared = pkg.get('icon') or meta.get('icon')
    if isinstance(declared, str):
        if declared.startswith('data:image/') and len(declared) <= 130_000:
            value.update(logo=declared, logoKind='manifest', logoSource=raw + 'package.json')
        elif declared.startswith('https://') or safe_path(declared):
            url = urllib.parse.urljoin(raw, declared)
            try:
                body = get(url, limit=1_000_000, timeout=5)
                logo = collector.icon_data(body, url)
                if not logo and (body.startswith((b'\x89PNG', b'\xff\xd8')) or (body[:4] == b'RIFF' and body[8:12] == b'WEBP')): logo = url
                if logo: value.update(logo=logo, logoKind='manifest', logoSource=url)
            except Exception: pass
    return value
def collect(repo):
    full = repo['full_name']; branch = repo.get('default_branch', 'HEAD')
    raw_branch = f'https://raw.githubusercontent.com/{full}/{branch}/'
    try: root_pkg = js(raw_branch + 'package.json')
    except Exception: root_pkg = {}
    root_valid = valid_manifest(root_pkg)
    # Inspect workspace-declared package paths and conventional small plugin subdirectories.
    workspaces = root_pkg.get('workspaces', []) if isinstance(root_pkg, dict) else []
    if isinstance(workspaces, dict): workspaces = workspaces.get('packages', [])
    declared_dirs = set(repo.get('packagePaths', []))
    for workspace in workspaces if isinstance(workspaces, list) else []:
        if isinstance(workspace, str) and '*' not in workspace and safe_path(workspace): declared_dirs.add(normalize_path(workspace))
    if not root_valid and not declared_dirs: return []
    try:
        sha = repo.get('commit') or pinned_sha(repo)
        if not isinstance(sha, str) or not re.fullmatch(r'[a-f0-9]{40}', sha): return []
        raw = f'https://raw.githubusercontent.com/{full}/{sha}/'
        plugins = []
        if root_valid:
            pinned = js(raw + 'package.json')
            if valid_manifest(pinned): plugins.append(make_plugin(repo, sha, pinned))
        for directory in list(declared_dirs)[:18]:
            if not safe_path(directory): continue
            try:
                pkg = js(raw + normalize_path(directory) + '/package.json')
                if valid_manifest(pkg): plugins.append(make_plugin(repo, sha, pkg, directory))
            except Exception: pass
        return plugins
    except Exception: return []
def main():
    parser = argparse.ArgumentParser(); parser.add_argument('--workers', type=int, default=28); parser.add_argument('--max-candidates', type=int, default=1600); parser.add_argument('--skip-search', action='store_true'); parser.add_argument('--curated-only', action='store_true'); parser.add_argument('--monorepo-only', action='store_true'); args = parser.parse_args()
    filename = ROOT / 'src/data/community.json'; previous = json.loads(filename.read_text(encoding='utf8')); previous_plugins = previous['plugins']
    known_repos = {p['url'].removeprefix('https://github.com/') for p in previous_plugins}
    candidate_file = ROOT / 'test-results/expanded-candidates.json'; candidates = {}
    if candidate_file.exists() and not args.curated_only and not args.monorepo_only:
        for repo in json.loads(candidate_file.read_text(encoding='utf8')).get('repositories', []): candidates[repo['full_name']] = repo
    searches = [
        ('topic:dsh-plugin archived:false fork:false', 'stars', page) for page in range(3, 9)
    ] + [
        ('topic:deepseek-harness archived:false fork:false', 'stars', 1),
        ('"DeepSeek Harness" in:description archived:false fork:false', 'updated', 1),
        ('dsh-plugin in:name archived:false fork:false', 'updated', 1),
        ('dsh plugins in:description archived:false fork:false', 'stars', 1),
    ]
    if not args.skip_search and not args.curated_only and not args.monorepo_only:
        for query, sort, page in searches:
            url = 'https://api.github.com/search/repositories?q=' + urllib.parse.quote(query) + f'&sort={sort}&order=desc&per_page=100&page={page}'
            try:
                data = js(url)
                for repo in data.get('items', []):
                    repo['discoverySource'] = f'GitHub search: {query}; sort={sort}; page={page}'
                    candidates[repo['full_name']] = repo
                print(f'Source {query} page {page}: {len(data.get("items", []))}; unique {len(candidates)}', flush=True)
            except Exception as error: print(f'Source unavailable: {query} page {page}: {error}', flush=True)
            time.sleep(6.2)
    curated_files = [ROOT / 'scripts/catalog-monorepo-candidates.json'] if args.monorepo_only else [ROOT / 'scripts/catalog-extra-candidates.json', ROOT / 'scripts/catalog-monorepo-candidates.json']
    for curated_file in curated_files:
      if curated_file.exists():
        for repo in json.loads(curated_file.read_text(encoding='utf8')).get('repositories', []):
            existing = candidates.setdefault(repo['full_name'], repo)
            existing['packagePaths'] = sorted(set(existing.get('packagePaths', []) + repo.get('packagePaths', [])))
    candidates = {full: repo for full, repo in candidates.items() if re.fullmatch(r'[\w.-]+/[\w.-]+', full)}
    candidate_file.parent.mkdir(exist_ok=True)
    if not args.curated_only and not args.monorepo_only: candidate_file.write_text(json.dumps({'repositories': list(candidates.values())}, ensure_ascii=False, indent=2) + '\n', encoding='utf8')
    pending = [repo for full, repo in candidates.items() if full not in known_repos or repo.get('packagePaths')][:args.max_candidates]
    print(f'Existing {len(previous_plugins)}; verifying {len(pending)} additional repositories', flush=True)
    discovered = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=args.workers) as pool:
        futures = [pool.submit(collect, repo) for repo in pending]
        for index, future in enumerate(concurrent.futures.as_completed(futures), 1):
            discovered += future.result()
            if index % 50 == 0: print(f'Checked {index}/{len(futures)}; found {len(discovered)} bundles', flush=True)
    by_id = {p['id']: p for p in previous_plugins}
    for plugin in sorted(discovered, key=lambda p: p.get('stars', -1)):
        old = by_id.get(plugin['id'])
        if old and old.get('url') != plugin['url']: continue
        if old:
            plugin = {**old, **plugin, 'logo': plugin.get('logo') or old.get('logo'), 'logoSource': plugin.get('logoSource') or old.get('logoSource'), 'logoKind': plugin.get('logoKind') or old.get('logoKind')}
        by_id[plugin['id']] = plugin
    result = list(by_id.values()); result.sort(key=lambda p: p.get('stars', -1), reverse=True)
    stamp = datetime.datetime.now(datetime.timezone.utc).isoformat()
    old_audit = previous.get('discoveryAudit', {})
    runs = old_audit.get('runs', [])
    run = {'at': stamp, 'mode': 'monorepo' if args.monorepo_only else 'curated' if args.curated_only else 'broad-search', 'repositoriesConsidered': len(candidates), 'repositoriesChecked': len(pending), 'bundlesFound': len(discovered), 'newPackages': len(result)-len(previous_plugins), 'sourceCounts': {source: sum(repo.get('discoverySource', '') == source for repo in candidates.values()) for source in sorted(set(repo.get('discoverySource', '') for repo in candidates.values()))}}
    runs.append(run)
    previous.update(fetchedAt=stamp, candidateCount=max(previous.get('candidateCount', 0), len(candidates)), strategy='Multiple GitHub topics, paginated stars and recent repositories, descriptive searches, curated directories and monorepo package paths; manifests verified at fixed Git commits', plugins=result)
    previous['discoveryAudit'] = {'repositoriesConsidered': max(old_audit.get('repositoriesConsidered', 0), len(candidates)), 'repositoriesCheckedThisRun': len(pending), 'bundlesFoundThisRun': len(discovered), 'previousPlugins': len(previous_plugins), 'newPackages': len(result)-len(previous_plugins), 'packagePaths': sum(bool(p.get('packagePath')) for p in result), 'runs': runs}
    filename.write_text(json.dumps(previous, ensure_ascii=False, indent=2) + '\n', encoding='utf8')
    print(json.dumps({'plugins':len(result), 'added':len(result)-len(previous_plugins), 'realLogos':sum(bool(p.get('logo')) for p in result), 'subdirectoryPackages':sum(bool(p.get('packagePath')) for p in result)}, ensure_ascii=False), flush=True)
if __name__ == '__main__': main()
