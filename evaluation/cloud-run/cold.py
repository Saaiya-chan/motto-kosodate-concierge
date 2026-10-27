"""Measure controlled stop/resume cold requests separately from warm queries."""
import json
import time
import urllib.error
import urllib.request
from deploy import ROOT, REGION, SERVICE, gcloud

PROJECT = 'motto-concierge-eval-1027'


def main():
    deployment = json.loads((ROOT / '.private/cloud-run-deployment.json').read_text())
    identity = gcloud('auth', 'print-identity-token', capture=True).stdout.strip()
    (ROOT / '.private/cloud-run-identity-token').write_text(identity)
    (ROOT / '.private/cloud-run-identity-token').chmod(0o600)
    key = (ROOT / '.private/search-container.env').read_text().strip().split('=', 1)[1]

    def get(path, auth=True):
        headers = {'X-Serverless-Authorization': 'Bearer ' + identity,
                   'Authorization': 'Bearer ' + key} if auth else {}
        start = time.monotonic()
        try:
            with urllib.request.urlopen(urllib.request.Request(deployment['url'] + path, headers=headers), timeout=120) as r:
                return dict(status=r.status, elapsedMs=round((time.monotonic()-start)*1000), data=json.load(r))
        except urllib.error.HTTPError as e:
            return dict(status=e.code, elapsedMs=round((time.monotonic()-start)*1000))

    results = {'method': 'Controlled manual scaling 0 -> auto; not natural idle scale-to-zero.',
               'unauthenticated': get('/api/health', auth=False), 'runs': []}
    for i in range(3):
        gcloud('run', 'services', 'update', SERVICE, '--project', PROJECT, '--region', REGION, '--scaling=0', '--quiet')
        stopped = None
        for _ in range(12):
            stopped = get('/api/health')
            if stopped['status'] >= 500:
                break
            time.sleep(5)
        if stopped['status'] < 500:
            raise RuntimeError('Disabled state not observed; do not claim cold start.')
        # Give terminated processes a short grace interval; prove a new process via uptime below.
        time.sleep(5)
        gcloud('run', 'services', 'update', SERVICE, '--project', PROJECT, '--region', REGION, '--scaling=auto', '--quiet')
        # Scaling control-plane updates may precede route propagation; retain those responses.
        resume_start = time.monotonic()
        attempts = []
        for _ in range(20):
            first = get('/metrics')
            attempts.append(first)
            if first['status'] == 200:
                break
            time.sleep(1)
        resume_ms = round((time.monotonic()-resume_start)*1000)
        warm = get('/metrics')
        results['runs'].append({'disabledResponse': stopped, 'cold': first, 'warm': warm,
                                'resumeToSuccessMs': resume_ms, 'resumeAttempts': attempts})
        (ROOT / '.private/cloud-run-cold.json').write_text(json.dumps(results, indent=2))
        if first['status'] != 200 or first['data']['uptimeMs'] > resume_ms + 10000:
            raise RuntimeError('No fresh process observed; do not claim cold start.')
        print(json.dumps({'run': i+1, 'coldMs': first['elapsedMs'],
                          'processReadyMs': first['data']['readyMs'], 'warmMs': warm['elapsedMs']}), flush=True)


if __name__ == '__main__':
    main()
