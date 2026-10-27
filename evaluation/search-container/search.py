"""Read-only official-document retrieval probe. No DB, queue or conversation storage."""
import hmac
import json
import os
from pathlib import Path
import resource
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

BOOT = time.monotonic()
import faiss
import numpy as np
from docsgpt.vectorstore.embeddings_local import EmbeddingsWrapper

MODEL = 'ibm-granite/granite-embedding-311m-multilingual-r2'
ROOT = Path('/opt/search')
TOKEN = os.environ['SEARCH_TOKEN']
INDEX = faiss.read_index(str(ROOT / 'index.faiss'))
SIDECAR = json.loads((ROOT / 'index.json').read_text())
EMBEDDER = EmbeddingsWrapper(MODEL)
LOCK = threading.Lock()
# Include lazy tokenizer/ONNX initialization in ready time rather than hiding it in query 1.
EMBEDDER.embed_query('起動確認')
READY_MS = round((time.monotonic() - BOOT) * 1000)


def metrics():
    usage = resource.getrusage(resource.RUSAGE_SELF)
    result = {'readyMs': READY_MS, 'peakRssBytes': usage.ru_maxrss * 1024,
              'cpuSeconds': usage.ru_utime + usage.ru_stime, 'chunks': INDEX.ntotal,
              'model': MODEL, 'uptimeMs': round((time.monotonic() - BOOT) * 1000)}
    for name in ['memory.current', 'memory.peak', 'memory.max']:
        try:
            value = Path('/sys/fs/cgroup', name).read_text().strip()
            result[name] = int(value) if value.isdigit() else value
        except OSError:
            pass
    return result


def search(query, count):
    start = time.monotonic()
    with LOCK:
        embed_start = time.monotonic()
        vector = np.array([EMBEDDER.embed_query(query)], dtype=np.float32)
        embed_ms = round((time.monotonic() - embed_start) * 1000)
        # Match /api/search: fetch 2*k then deduplicate by the first 200 text characters.
        distances, rows = INDEX.search(vector, min(count * 2, INDEX.ntotal))
    seen, hits = set(), []
    for distance, row in zip(distances[0], rows[0]):
        if row < 0:
            continue
        doc_id = SIDECAR['index_to_docstore_id'][str(int(row))]
        doc = SIDECAR['documents'][doc_id]
        text, metadata = doc['page_content'], doc.get('metadata') or {}
        if text[:200] in seen:
            continue
        seen.add(text[:200])
        title = metadata.get('title', metadata.get('post_title', ''))
        title = str(title).split('/')[-1] if title else metadata.get('filename', text[:50] + '...')
        hits.append({'text': text, 'title': title, 'source': metadata.get('source', 'official'),
                     'distance': float(distance)})
        if len(hits) >= count:
            break
    return hits, {'embedMs': embed_ms, 'searchMs': round((time.monotonic() - start) * 1000)}


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *_):
        pass  # Never log consultation bodies, tokens or URL query strings.

    def send_json(self, code, value, timings=None):
        data = json.dumps(value, ensure_ascii=False).encode()
        self.send_response(code)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(data)))
        self.send_header('Cache-Control', 'no-store')
        if timings:
            self.send_header('X-Search-Timings', json.dumps(timings))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        if self.path == '/api/health':
            return self.send_json(200, {'ready': True})
        if self.path == '/metrics' and hmac.compare_digest(self.headers.get('Authorization', ''), 'Bearer ' + TOKEN):
            return self.send_json(200, metrics())
        self.send_json(404, {'error': 'not found'})

    def do_POST(self):
        if self.path != '/api/search':
            return self.send_json(404, {'error': 'not found'})
        try:
            length = int(self.headers.get('Content-Length', '0'))
            if not 0 < length <= 32000:
                return self.send_json(413, {'error': 'request too large'})
            body = json.loads(self.rfile.read(length))
            if not isinstance(body.get('api_key'), str) or not hmac.compare_digest(body['api_key'], TOKEN):
                return self.send_json(401, {'error': 'unauthorized'})
            query, count = body.get('question'), body.get('chunks', 6)
            if not isinstance(query, str) or not query.strip() or len(query) > 6000 or type(count) is not int or not 1 <= count <= 12:
                return self.send_json(400, {'error': 'invalid search'})
            hits, timings = search(query, count)
            return self.send_json(200, hits, timings)
        except (ValueError, KeyError, TypeError):
            return self.send_json(400, {'error': 'invalid request'})
        except Exception:
            return self.send_json(500, {'error': 'search failed'})


print(json.dumps({'event': 'ready', **metrics()}), flush=True)
ThreadingHTTPServer(('0.0.0.0', 8080), Handler).serve_forever()
