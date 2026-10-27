import json
from cf import api, ROOT, INSTANCE

body = {'id': INSTANCE, 'embedding_model': '@cf/qwen/qwen3-embedding-0.6b',
        'chunk_size': 1250, 'chunk_overlap': 0, 'max_num_results': 6,
        'hybrid_search_enabled': True, 'cache': False, 'reranking': False,
        'score_threshold': 0, 'indexing_options': {'keyword_tokenizer': 'trigram'}}
result = api('', body)
(ROOT / '.private/ai-search-instance.json').write_text(json.dumps(result, indent=2))
print(json.dumps({key: result.get(key) for key in ['id', 'namespace', 'status', 'embedding_model', 'hybrid_search_enabled', 'indexing_options']}))
