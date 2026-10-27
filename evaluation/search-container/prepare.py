"""Export only the registered official corpus and public model from local DocsGPT."""
from pathlib import Path
import hashlib
import json
import shutil
import subprocess

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / '.private/search-container-context'
CONTAINER = 'motto-docsgpt-eval-backend-1'
SOURCE = '42dabb3c-94a8-574d-9ab7-6e3e80f76a57'
MODEL = 'models--ibm-granite--granite-embedding-311m-multilingual-r2'
OUT.mkdir(parents=True, exist_ok=True)
for name in ['index.faiss', 'index.json']:
    subprocess.run(['docker', 'cp', f'{CONTAINER}:/app/indexes/{SOURCE}/{name}', str(OUT / name)], check=True)
manifest = json.loads((ROOT / 'data/source-manifest.json').read_text())
allowed = {Path(s['file']).name.replace('.html', '.txt') for s in manifest['sources']}
sidecar = json.loads((OUT / 'index.json').read_text())
for doc in sidecar['documents'].values():
    if Path(doc['metadata']['filename']).name not in allowed:
        raise RuntimeError('Index contains an unregistered document; do not deploy')
if not (OUT / 'model').exists():
    subprocess.run(['docker', 'cp', f'{CONTAINER}:/app/models/{MODEL}', str(OUT / 'model')], check=True)
for name in ['search.py', 'Dockerfile']:
    shutil.copyfile(Path(__file__).parent / name, OUT / name)
(OUT / '.dockerignore').write_text('*\n!Dockerfile\n!search.py\n!index.faiss\n!index.json\n!model/\n!model/**\n')
proof = {'source': SOURCE, 'chunks': len(sidecar['documents']), 'files': {name: hashlib.sha256((OUT / name).read_bytes()).hexdigest() for name in ['index.faiss', 'index.json']}}
(ROOT / '.private/search-container-corpus.json').write_text(json.dumps(proof, indent=2))
print(json.dumps({'chunks': proof['chunks'], 'registeredFiles': len(allowed)}))
