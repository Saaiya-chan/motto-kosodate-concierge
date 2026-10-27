"""User-authorized mobile trial UI. Search remains private; web is public HTTPS."""
import json
import argparse
import shutil
import subprocess
from deploy import ROOT, REGION, ENV, CLI, gcloud
from budget import main as ensure_budget

PROJECT = 'motto-concierge-eval-1027'
SERVICE = 'motto-concierge-web-try'
REPO = 'concierge-web-trial'
SA = 'concierge-web-run@' + PROJECT + '.iam.gserviceaccount.com'


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--deploy', action='store_true')
    args = parser.parse_args()
    if not args.deploy:
        print(json.dumps({'project': PROJECT, 'service': SERVICE, 'publicHTTPS': True,
                          'secretsToStore': ['existing Gemini API key', 'existing search application key'],
                          'secretStorage': 'Google Secret Manager, two dedicated secrets, pinned versions',
                          'runtimeIdentity': SA, 'permissions': ['search service run.invoker', 'two secrets secretAccessor'],
                          'cloudRunBudgetJPY': 500, 'logging': 'disabled', 'cpu': 1, 'memory': '512Mi', 'min': 0, 'max': 1}, indent=2))
        return
    ensure_budget()
    gcloud('services', 'enable', 'secretmanager.googleapis.com', '--project', PROJECT, '--quiet')
    search = json.loads((ROOT / '.private/cloud-run-deployment.json').read_text())
    accounts = json.loads(gcloud('iam', 'service-accounts', 'list', '--project', PROJECT, '--format=json', capture=True).stdout)
    if not any(a.get('email') == SA for a in accounts):
        gcloud('iam', 'service-accounts', 'create', 'concierge-web-run', '--project', PROJECT, '--display-name=Concierge web search invoker', '--quiet')
    gcloud('run', 'services', 'add-iam-policy-binding', search['service'], '--region', REGION, '--project', PROJECT,
           '--member=serviceAccount:' + SA, '--role=roles/run.invoker', '--quiet')
    repos = json.loads(gcloud('artifacts', 'repositories', 'list', '--location', REGION, '--project', PROJECT, '--format=json', capture=True).stdout)
    if not any(r['name'].endswith('/' + REPO) for r in repos):
        gcloud('artifacts', 'repositories', 'create', REPO, '--repository-format=docker', '--location', REGION, '--project', PROJECT, '--quiet')
    context = ROOT / '.private/cloud-run-web-context'
    context.mkdir(exist_ok=True)
    for name in ['src', 'public', 'data']:
        shutil.copytree(ROOT / name, context / name, dirs_exist_ok=True)
    for name in ['Dockerfile', 'package.json']:
        shutil.copyfile(ROOT / name, context / name)
    image = f'{REGION}-docker.pkg.dev/{PROJECT}/{REPO}/web:trial-20261027'
    docker_config = ROOT / '.private/cloud-run-docker'
    docker_config.mkdir(mode=0o700, exist_ok=True)
    docker_env = {**ENV, 'DOCKER_CONFIG': str(docker_config)}
    token = gcloud('auth', 'print-access-token', capture=True).stdout.strip()
    subprocess.run(['docker', 'login', '-u', 'oauth2accesstoken', '--password-stdin', 'https://' + REGION + '-docker.pkg.dev'], input=token, text=True, env=docker_env, check=True)
    subprocess.run(['docker', 'buildx', 'build', '--platform=linux/amd64', '-t', image, '--push', str(context)], env=docker_env, check=True)
    gemini = json.loads((ROOT / '.private/gemini-config.json').read_text())
    search_key = (ROOT / '.private/search-container.env').read_text().strip().split('=', 1)[1]
    number = gcloud('projects', 'describe', PROJECT, '--format=value(projectNumber)', capture=True).stdout.strip()
    origin = f'https://{SERVICE}-{number}.{REGION}.run.app'
    existing = json.loads(gcloud('secrets', 'list', '--project', PROJECT, '--format=json', capture=True).stdout)
    bindings = []
    for env_name, secret_name, value in [('GEMINI_API_KEY', 'concierge-trial-gemini', gemini['apiKey']),
                                         ('DOCSGPT_API_KEY', 'concierge-trial-search', search_key)]:
        if any(s['name'].endswith('/' + secret_name) for s in existing):
            command = ['secrets', 'versions', 'add', secret_name]
        else:
            command = ['secrets', 'create', secret_name, '--replication-policy=automatic']
        saved = subprocess.run([str(CLI), *command, '--project', PROJECT, '--data-file=-', '--format=json', '--quiet'],
                               input=value, text=True, env=ENV, check=True, stdout=subprocess.PIPE)
        # Creation returns a Secret; explicitly retrieve version metadata, never its payload.
        metadata = json.loads(saved.stdout)
        if '/versions/' in metadata.get('name', ''):
            version = metadata['name'].split('/')[-1]
        else:
            versions = json.loads(gcloud('secrets', 'versions', 'list', secret_name, '--project', PROJECT,
                                        '--filter=state:ENABLED', '--sort-by=~createTime', '--limit=1', '--format=json', capture=True).stdout)
            version = versions[0]['name'].split('/')[-1]
        gcloud('secrets', 'add-iam-policy-binding', secret_name, '--project', PROJECT,
               '--member=serviceAccount:' + SA, '--role=roles/secretmanager.secretAccessor', '--quiet')
        bindings.append(env_name + '=' + secret_name + ':' + version)
    variables = {'APP_PUBLIC_ORIGIN': origin, 'DOCSGPT_URL': search['url'], 'DOCSGPT_IAM_AUDIENCE': search['url'],
                 'DOCSGPT_PIPELINE': 'search',
                 'CHAT_LOG_DISABLED': '1', 'MOTTO_GEMINI_PRIVATE_DIR': '/tmp/concierge-trial'}
    env_file = ROOT / '.private/cloud-run-web-env.json'
    env_file.write_text(json.dumps(variables))
    env_file.chmod(0o600)
    gcloud('run', 'deploy', SERVICE, '--project', PROJECT, '--region', REGION, '--image', image,
           '--service-account', SA, '--cpu=1', '--memory=512Mi', '--min=0', '--max=1', '--concurrency=1',
           '--timeout=120', '--cpu-throttling', '--no-cpu-boost', '--allow-unauthenticated',
           '--env-vars-file', str(env_file), '--set-secrets=' + ','.join(bindings), '--quiet')
    # Only publish the canonical URL accepted by the existing host/origin validation.
    proof = {'project': PROJECT, 'service': SERVICE, 'region': REGION, 'url': origin, 'searchURL': search['url'],
             'logging': 'disabled', 'min': 0, 'max': 1, 'cpu': 1, 'memory': '512Mi', 'runtimeServiceAccount': SA}
    (ROOT / '.private/cloud-run-web-deployment.json').write_text(json.dumps(proof, indent=2))
    print(json.dumps(proof, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
