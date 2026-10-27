import hashlib
import json
import mimetypes
import uuid
from cf import api, ROOT, INSTANCE

path = ROOT / '.private/ai-search-upload.json'
state = json.loads(path.read_text()) if path.exists() else {'files': []}
manifest = json.loads((ROOT / 'data/source-manifest.json').read_text())
for source in manifest['sources']:
    original = ROOT / 'data' / source['file']
    assert hashlib.sha256(original.read_bytes()).hexdigest() == source['sha256']
    upload = original.with_suffix('.txt') if original.suffix == '.html' else original
    digest = hashlib.sha256(upload.read_bytes()).hexdigest()
    if any(row['filename'] == upload.name and row['sha256'] == digest for row in state['files']):
        continue
    boundary = 'evaluation-' + uuid.uuid4().hex
    mime = mimetypes.guess_type(upload.name)[0] or 'application/octet-stream'
    data = (f'--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="{upload.name}"\r\nContent-Type: {mime}\r\n\r\n'.encode()
            + upload.read_bytes() + f'\r\n--{boundary}--\r\n'.encode())
    result = api('/' + INSTANCE + '/items', method='POST', data=data, content_type='multipart/form-data; boundary=' + boundary)
    state['files'].append({'sourceId': source['id'], 'filename': upload.name, 'sha256': digest,
                           'bytes': upload.stat().st_size, 'result': result})
    path.write_text(json.dumps(state, ensure_ascii=False, indent=2))
    print('uploaded', upload.name, len(state['files']), flush=True)
