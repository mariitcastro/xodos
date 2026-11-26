# Coloca um número de versão (pelo conteúdo) nos arquivos do site, para o celular não usar cópia antiga.
import hashlib, re
def h(f): return hashlib.sha1(open(f, 'rb').read()).hexdigest()[:8]
ver = {f: h(f) for f in ['app.css', 'app.js', 'theme.js']}
idx = open('index.html').read()
for f, v in ver.items():
    idx = re.sub(r'(src|href)="' + re.escape(f) + r'(\?v=[0-9a-f]+)?"', lambda m: f'{m.group(1)}="{f}?v={v}"', idx)
open('index.html', 'w').write(idx)
print(ver)
