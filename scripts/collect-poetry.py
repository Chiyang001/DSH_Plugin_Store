"""Build a local, deterministic classical poetry collection; no runtime network calls.

Build tool: python -m pip install --target test-results/poetry-tools opencc-python-reimplemented
"""
from pathlib import Path
import json
import random
import re
import sys
import urllib.parse
import urllib.request

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / 'test-results/poetry-tools'))
from opencc import OpenCC

converter = OpenCC('t2s')
repository = 'https://github.com/chinese-poetry/chinese-poetry'

def read(url):
    return urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': 'DSH-Plugin-Store'}), timeout=30).read().decode('utf-8')

commit = json.loads(read('https://api.github.com/repos/chinese-poetry/chinese-poetry/commits/master'))['sha']
paths = ['蒙学/tangshisanbaishou.json', '宋词/宋词三百首.json']
works = []

def clean(text):
    return converter.convert(re.sub(r'[（(][^()（）]*[）)]', '', text)).strip()

for path in paths:
    data = json.loads(read(f'https://raw.githubusercontent.com/chinese-poetry/chinese-poetry/{commit}/' + urllib.parse.quote(path)))
    poems = data if isinstance(data, list) else [poem for section in data['content'] for poem in section['content']]
    for poem in poems:
        author_raw = converter.convert(poem['author'])
        author = clean(author_raw)
        paragraphs = [clean(p) for p in poem['paragraphs']]
        text = ''.join(paragraphs)
        title = clean(poem.get('chapter') or poem.get('rhythmic') or poem.get('title', ''))
        if path.startswith('宋词'):
            opening = re.split(r'[，。！？、；：]', text)[0]
            title += '·' + opening
        if not author or not title:
            continue
        sentences = re.findall(r'[^。！？]+[。！？]', text)
        candidates = []
        for index, sentence in enumerate(sentences):
            if len(sentence) < 10 and index + 1 < len(sentences):
                sentence += sentences[index + 1]
            if not 10 <= len(sentence) <= 38 or re.search(r'[^\u3400-\u9fff，。！？、；：·「」『』]', sentence):
                continue
            if sentence not in candidates:
                candidates.append(sentence)
        if candidates:
            works.append((author, title, candidates, path))

# Prefer a different work for every entry before adding further excerpts.
entries, seen = [], set()
for candidate_index in range(max(len(work[2]) for work in works)):
    for author, title, candidates, path in works:
        if candidate_index >= len(candidates) or candidates[candidate_index] in seen:
            continue
        text = candidates[candidate_index]
        seen.add(text)
        entries.append({'text': text, 'author': author, 'title': title})
    if len(entries) >= 730:
        break
if len(entries) < 730:
    raise RuntimeError(f'Only {len(entries)} distinct excerpts found')
entries = entries[:730]
random.Random('chiyang001-paper-poetry-v1').shuffle(entries)
opening = '行到水穷处，坐看云起时。'
index = next((i for i, entry in enumerate(entries) if entry['text'] == opening), None)
if index is not None:
    entries[0], entries[index] = entries[index], entries[0]
else:
    author, title, _, _ = next(work for work in works if opening in work[2])
    entries[0] = {'text': opening, 'author': author, 'title': title}
result = {'epoch': '2026-11-01', 'source': repository, 'commit': commit, 'collections': paths, 'verses': entries}
(ROOT / 'src/data/poetry.json').write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
license_text = read(f'https://raw.githubusercontent.com/chinese-poetry/chinese-poetry/{commit}/LICENSE')
notice = ROOT / 'THIRD-PARTY-NOTICES.md'
marker = '\n## Classical poetry data\n'
content = notice.read_text(encoding='utf-8').split(marker)[0]
notice.write_text(content + marker + f'\nPublic-domain classical texts selected from [{repository}]({repository}), commit `{commit}`. Traditional characters are converted to simplified Chinese at build time. The dataset is distributed under the following MIT license:\n\n' + license_text + '\n', encoding='utf-8')
print(json.dumps({'excerpts': len(entries), 'works': len(set((e['author'], e['title']) for e in entries)), 'authors': len(set(e['author'] for e in entries)), 'commit': commit}, ensure_ascii=False))
