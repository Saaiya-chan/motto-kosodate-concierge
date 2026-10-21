"""Local-only, persistent Ruri retrieval worker. JSON lines on stdin/stdout."""
import os,time,json,sys,hashlib
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
os.environ['HF_HOME']=str(ROOT/'.cache/huggingface')
os.environ['TOKENIZERS_PARALLELISM']='false'
os.environ['HF_HUB_DISABLE_TELEMETRY']='1'
os.environ['HF_HUB_DISABLE_PROGRESS_BARS']='1'
START=time.perf_counter()
import numpy as np
import torch
from sentence_transformers import SentenceTransformer
MODEL='cl-nagoya/ruri-v3-70m'
REVISION='07a8b0aba47d29d2ca21f89b915c1efe2c23d1cc'
torch.set_num_threads(4)
raw=(ROOT/'data/source-chunks.json').read_bytes()
chunks=json.loads(raw)
fingerprint=hashlib.sha256(raw+MODEL.encode()+REVISION.encode()+b'retrieval-v1:2048:title:prefix').hexdigest()
model=SentenceTransformer(MODEL,revision=REVISION,device='cpu',trust_remote_code=False,model_kwargs={'attn_implementation':'sdpa'})
model.max_seq_length=2048
index=ROOT/'.cache/ruri-index.npz'
index.parent.mkdir(exist_ok=True)
index_start=time.perf_counter()
try:
 saved=np.load(index,allow_pickle=False)
 if str(saved['fingerprint'])!=fingerprint:raise ValueError('stale index')
 vectors=saved['vectors']
except (OSError,ValueError,KeyError):
 texts=['検索文書: '+c['title']+'\n'+c['text'] for c in chunks]
 lengths=[len(model.tokenizer(t)['input_ids']) for t in texts]
 if max(lengths)>model.max_seq_length:raise RuntimeError('Document chunk exceeds configured token limit')
 vectors=model.encode(texts,batch_size=8,normalize_embeddings=True,show_progress_bar=False,convert_to_numpy=True)
 np.savez_compressed(index,vectors=vectors,fingerprint=fingerprint)
index_ms=round((time.perf_counter()-index_start)*1000,2)
# Warm up query inference separately from measured requests.
model.encode(['検索クエリ: 子育て支援'],normalize_embeddings=True,show_progress_bar=False)
print(json.dumps({'ready':True,'model':MODEL,'revision':REVISION,'device':'cpu','chunks':len(chunks),'coldStartMs':round((time.perf_counter()-START)*1000,2),'indexLoadOrBuildMs':index_ms}),flush=True)
for line in sys.stdin:
 request={}
 try:
  request=json.loads(line);start=time.perf_counter()
  q=model.encode(['検索クエリ: '+request['query']],normalize_embeddings=True,show_progress_bar=False,convert_to_numpy=True)[0]
  scores=vectors@q
  ids=request.get('programIds',[])
  allowed=[i for i,c in enumerate(chunks) if not ids or any(p in ids for p in c['programIds'])]
  ranked=sorted(allowed,key=lambda i:float(scores[i]),reverse=True)[:request.get('limit',4)]
  print(json.dumps({'requestId':request['requestId'],'hits':[{'id':chunks[i]['id'],'score':float(scores[i])} for i in ranked],'searchMs':round((time.perf_counter()-start)*1000,2)}),flush=True)
 except Exception:
  print(json.dumps({'requestId':request.get('requestId'),'error':'Ruri検索を完了できませんでした。'}),flush=True)
