"""Evaluation-only API access. Never print or copy the Wrangler OAuth credential."""
import json
from pathlib import Path
import tomllib
import urllib.request
import urllib.error

ROOT = Path(__file__).resolve().parents[2]
ACCOUNT = '44574b6f591973f3bef7e73cc34826fa'
INSTANCE = 'motto-concierge-12-docs-eval'
BASE = f'https://api.cloudflare.com/client/v4/accounts/{ACCOUNT}/ai-search/namespaces/default/instances'


def api(path='', body=None, method=None, data=None, content_type=None):
    credential = Path.home() / 'Library/Preferences/.wrangler/config/default.toml'
    token = tomllib.loads(credential.read_text())['oauth_token']
    headers = {'Authorization': 'Bearer ' + token}
    if body is not None:
        data = json.dumps(body).encode()
        content_type = 'application/json'
    if content_type:
        headers['Content-Type'] = content_type
    request = urllib.request.Request(BASE + path, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(request, timeout=120) as response:
            result = json.load(response)
    except urllib.error.HTTPError as error:
        # API URL has no key and only the first Cloudflare message is exposed.
        value = json.loads(error.read())
        raise RuntimeError(f'Cloudflare HTTP {error.code}: ' + json.dumps(value.get('errors', []), ensure_ascii=False)[:600]) from None
    if result.get('success') is False:
        raise RuntimeError('Cloudflare API rejected request')
    return result.get('result', result)
