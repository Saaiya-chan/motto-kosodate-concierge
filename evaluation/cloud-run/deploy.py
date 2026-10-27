"""Deploy the existing read-only probe; requires an explicitly selected billed project."""
import argparse
import json
import os
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[2]
CLI = ROOT / '.private/google-cloud-sdk/bin/gcloud'
ENV = {**os.environ, 'CLOUDSDK_CONFIG': str(ROOT / '.private/gcloud-config')}
SERVICE = 'motto-concierge-search-eval'
REGION = 'asia-northeast1'
REPOSITORY = 'concierge-search-eval'


def gcloud(*args, capture=False):
    return subprocess.run([str(CLI), *args], cwd=ROOT, env=ENV, check=True,
                          text=True, stdout=subprocess.PIPE if capture else None)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--project', required=True)
    parser.add_argument('--deploy', action='store_true', help='Mutate Google Cloud; otherwise print plan only')
    args = parser.parse_args()
    image = f'{REGION}-docker.pkg.dev/{args.project}/{REPOSITORY}/search:eval-20261027'
    plan = dict(project=args.project, service=SERVICE, region=REGION, image=image,
                cpu=1, memory='2Gi', minimum=0, maximum=1, concurrency=1,
                authentication='IAM required; application key also required',
                billing='request based', cpuBoost=False, corpus='existing 12 documents / 79 chunks')
    if not args.deploy:
        print(json.dumps(plan, ensure_ascii=False, indent=2))
        return
    billing = json.loads(gcloud('billing', 'projects', 'describe', args.project, '--format=json', capture=True).stdout)
    if not billing.get('billingEnabled'):
        raise SystemExit('Project billing is not enabled; no resources created.')
    if args.project != 'motto-concierge-eval-1027':
        raise SystemExit('Deploy mode is restricted to the approved evaluation project.')
    # A rerun must not silently bypass the user's JPY500 stop condition.
    from budget import main as ensure_budget
    ensure_budget()
    context = ROOT / '.private/search-container-context'
    sidecar = json.loads((context / 'index.json').read_text())
    manifest = json.loads((ROOT / 'data/source-manifest.json').read_text())
    allowed = {Path(s['file']).name.replace('.html', '.txt') for s in manifest['sources']}
    actual = {Path(doc['metadata']['filename']).name for doc in sidecar['documents'].values()}
    if len(allowed) != 12 or actual != allowed or len(sidecar['documents']) != 79:
        raise SystemExit('Corpus mismatch; do not deploy.')
    gcloud('services', 'enable', 'run.googleapis.com', 'artifactregistry.googleapis.com', '--project', args.project, '--quiet')
    repositories = json.loads(gcloud('artifacts', 'repositories', 'list', '--location', REGION,
                                    '--project', args.project, '--format=json', capture=True).stdout)
    if not any(r['name'].endswith('/' + REPOSITORY) for r in repositories):
        gcloud('artifacts', 'repositories', 'create', REPOSITORY, '--repository-format=docker',
               '--location', REGION, '--project', args.project, '--quiet')
    # Docker auth is isolated from the user's normal Docker credential configuration.
    docker_config = ROOT / '.private/cloud-run-docker'
    docker_config.mkdir(mode=0o700, exist_ok=True)
    token = gcloud('auth', 'print-access-token', capture=True).stdout.strip()
    docker_env = {**ENV, 'DOCKER_CONFIG': str(docker_config)}
    subprocess.run(['docker', 'login', '-u', 'oauth2accesstoken', '--password-stdin',
                    f'https://{REGION}-docker.pkg.dev'], input=token, text=True, env=docker_env, check=True)
    subprocess.run(['docker', 'buildx', 'build', '--platform', 'linux/amd64', '-t', image,
                    '--push', str(context)], env=docker_env, check=True)
    key = (ROOT / '.private/search-container.env').read_text().strip().split('=', 1)[1]
    env_file = ROOT / '.private/cloud-run-env.json'
    env_file.write_text(json.dumps({'SEARCH_TOKEN': key}))
    env_file.chmod(0o600)
    gcloud('run', 'deploy', SERVICE, '--image', image, '--region', REGION, '--project', args.project,
           '--cpu=1', '--memory=2Gi', '--min=0', '--max=1', '--concurrency=1', '--timeout=120',
           '--cpu-throttling', '--no-cpu-boost', '--execution-environment=gen2',
           '--no-allow-unauthenticated', '--env-vars-file', str(env_file), '--quiet')
    description = json.loads(gcloud('run', 'services', 'describe', SERVICE, '--region', REGION,
                                    '--project', args.project, '--format=json', capture=True).stdout)
    # Do not persist service description: it contains the application environment secret.
    proof = {**plan, 'url': description['status']['url'],
             'revision': description['status'].get('latestReadyRevisionName')}
    (ROOT / '.private/cloud-run-deployment.json').write_text(json.dumps(proof, indent=2))
    print(json.dumps(proof, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
