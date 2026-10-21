"""Run inside the private DocsGPT service. Never prints the resulting API key."""
import hashlib
import json
import mimetypes
from pathlib import Path
import time
import urllib.request
import uuid

BASE='http://127.0.0.1:7091'
STATE=Path('/data/concierge-seed.json')
AGENT=Path('/data/concierge-agent.json')

def api(route,body=None):
    payload=json.dumps(body).encode() if body is not None else None
    request=urllib.request.Request(BASE+route,data=payload,headers={'Content-Type':'application/json'})
    with urllib.request.urlopen(request,timeout=60) as response:return json.load(response)

def save(path,value):
    path.write_text(json.dumps(value,ensure_ascii=False))
    path.chmod(0o600)

if AGENT.exists():
    print('Agent already provisioned; key remains in /data/concierge-agent.json')
    raise SystemExit(0)
manifest=json.loads(Path('/opt/concierge/data/source-manifest.json').read_text())['sources']
if STATE.exists():state=json.loads(STATE.read_text())
else:
    boundary='concierge-'+uuid.uuid4().hex
    parts=[]
    def field(name,value):
        parts.append(f'--{boundary}\r\nContent-Disposition: form-data; name="{name}"\r\n\r\n{value}\r\n'.encode())
    field('user','local');field('name','motto-official-documents')
    for source in manifest:
        original=Path('/opt/concierge/data')/source['file']
        if hashlib.sha256(original.read_bytes()).hexdigest()!=source['sha256']:raise RuntimeError('Source fingerprint differs: '+source['id'])
        upload=original.with_suffix('.txt') if original.suffix=='.html' else original
        mime=mimetypes.guess_type(upload.name)[0] or 'application/octet-stream'
        parts.append(f'--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="{upload.name}"\r\nContent-Type: {mime}\r\n\r\n'.encode()+upload.read_bytes()+b'\r\n')
    parts.append(f'--{boundary}--\r\n'.encode())
    request=urllib.request.Request(BASE+'/api/upload',data=b''.join(parts),headers={'Content-Type':f'multipart/form-data; boundary={boundary}','Idempotency-Key':'concierge-official-v1'})
    with urllib.request.urlopen(request,timeout=120) as response:state=json.load(response)
    if not state.get('source_id') or not state.get('task_id'):raise RuntimeError('Upload did not return source/task identifiers')
    save(STATE,state)
    print('Uploaded',len(manifest),'official documents',flush=True)
for _ in range(360):
    result=api('/api/task_status?task_id='+state['task_id'])
    status=result.get('status')
    if status=='SUCCESS':break
    if status in ['FAILURE','REVOKED']:raise RuntimeError('Document indexing failed; inspect private service logs')
    time.sleep(5)
else:raise RuntimeError('Indexing is still pending; rerun the same script to resume')
prompt=api('/api/create_prompt',{'name':'子育てコンシェルジュ','content':'登録された資料の範囲で、日本語で質問に直接回答してください。'})
agent=api('/api/create_agent',{'name':'子育てコンシェルジュ公式資料','description':'Registered official childcare support documents','source':state['source_id'],'chunks':6,'retriever':'classic','prompt_id':prompt['id'],'agent_type':'classic','status':'published','models':['gemini-3.5-flash-lite'],'default_model_id':'gemini-3.5-flash-lite','tools':[]})
if not agent.get('key'):raise RuntimeError('Agent key missing')
save(AGENT,agent)
print('Index and agent ready; key saved privately in /data/concierge-agent.json',flush=True)
