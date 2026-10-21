"""Add the fee-setting FAQ linked by the official child-shortstay page."""
from pathlib import Path
import hashlib,json,subprocess,urllib.request
ROOT=Path(__file__).resolve().parents[1]
URL='https://www.cfa.go.jp/assets/contents/node/basic_page/field_ref_resources/8a43806e-f35e-4d12-b712-d3f9f6344c9f/a71715ca/20250911_policies_kosodateshien_jido-short_17.pdf'
with urllib.request.urlopen(URL,timeout=60) as response:
 if response.url!=URL:raise ValueError('unexpected redirect')
 data=response.read()
if not data.startswith(b'%PDF'):raise ValueError('expected PDF')
path=ROOT/'data/documents/shortstay-faq.pdf';path.write_bytes(data)
subprocess.run(['pdftotext','-layout',str(path),str(path.with_suffix('.txt'))],check=True)
text=path.with_suffix('.txt').read_text()
if '利用料については、市町村において' not in text:raise ValueError('fee passage missing')
manifest_path=ROOT/'data/source-manifest.json';manifest=json.loads(manifest_path.read_text())
entry={'id':'shortstay-faq','programIds':['shortstay','twilight'],'title':'子育て短期支援事業FAQ（第3版・令和7年9月更新）','url':URL,'downloadedAt':'2026-10-21','file':'documents/shortstay-faq.pdf','sha256':hashlib.sha256(data).hexdigest(),'pages':len([p for p in text.split('\f') if p.strip()])}
manifest['sources']=[s for s in manifest['sources'] if s['id']!=entry['id']]+[entry]
manifest['importedAt']='2026-10-21';manifest_path.write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
subprocess.run(['python3',str(ROOT/'scripts/reindex-sources.py')],check=True)
print(json.dumps({'id':entry['id'],'pages':entry['pages'],'sha256':entry['sha256']}))
