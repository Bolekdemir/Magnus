#!/usr/bin/env python3
"""Cache-busting: stamp ?v=<hash of the app's code> on every script and stylesheet the page loads.

Run before committing:  python3 tools/stamp.py
The hash only changes when the code does, so unchanged releases keep their cache.
"""
import hashlib, pathlib, re

ROOT = pathlib.Path(__file__).resolve().parent.parent
files = sorted(list((ROOT / 'js').glob('*.js')) + list((ROOT / 'css').glob('*.css')) + [ROOT / 'vendor' / 'chess.js'])
QS = re.compile(r'\?v=[0-9a-f]+')

def strip(text):
    return QS.sub('', text)

h = hashlib.sha1()
for f in files:
    h.update(strip(f.read_text()).encode())
v = h.hexdigest()[:10]

# relative ES module imports, dynamic module URLs, and the worker URL
JS_IMPORT = re.compile(r"""((?:from|import)\s*\(?\s*['"])(\.\.?/[^'"?]+\.js)(\?v=[0-9a-f]+)?(['"])""")
JS_URL = re.compile(r"""(new URL\(\s*['"])(\.\.?/[^'"?]+\.js)(\?v=[0-9a-f]+)?(['"])""")
for f in (ROOT / 'js').glob('*.js'):
    t = f.read_text()
    n = JS_IMPORT.sub(lambda m: f"{m.group(1)}{m.group(2)}?v={v}{m.group(4)}", t)
    n = JS_URL.sub(lambda m: f"{m.group(1)}{m.group(2)}?v={v}{m.group(4)}", n)
    if n != t:
        f.write_text(n)

idx = ROOT / 'index.html'
t = idx.read_text()
n = re.sub(r'((?:href|src)="(?:css/[^"?]+\.css|js/main\.js))(\?v=[0-9a-f]+)?"', lambda m: f'{m.group(1)}?v={v}"', t)
if n != t:
    idx.write_text(n)
print('stamped', v)
