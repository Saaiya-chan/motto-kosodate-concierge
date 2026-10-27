"""Configure the user-approved JPY 500 monthly Cloud Run spend cap only."""
import json
import urllib.request
from deploy import ROOT, gcloud

PROJECT = 'motto-concierge-eval-1027'
NAME = 'Concierge evaluation Cloud Run JPY500 monthly stop'


def main():
    billing = json.loads(gcloud('billing', 'projects', 'describe', PROJECT, '--format=json', capture=True).stdout)
    if not billing.get('billingEnabled'):
        raise SystemExit('Project billing is not enabled.')
    account_name = billing['billingAccountName']
    token = gcloud('auth', 'print-access-token', capture=True).stdout.strip()

    def request(url, payload=None):
        headers = {'Authorization': 'Bearer ' + token, 'x-goog-user-project': PROJECT}
        if payload is not None:
            headers['Content-Type'] = 'application/json'
        req = urllib.request.Request(url, headers=headers,
                                     data=None if payload is None else json.dumps(payload).encode())
        with urllib.request.urlopen(req) as response:
            return json.load(response)

    account = request(f'https://cloudbilling.googleapis.com/v1/{account_name}')
    if account.get('currencyCode') != 'JPY':
        raise SystemExit('Billing currency is not JPY; do not substitute another amount silently.')
    base = f'https://billingbudgets.googleapis.com/v1/{account_name}/budgets'
    existing = request(base).get('budgets', [])
    matches = [b for b in existing if b.get('displayName') == NAME]
    payload = {
        'displayName': NAME,
        'budgetFilter': {'projects': ['projects/' + PROJECT],
                         'services': ['services/152E-C115-5142'],
                         'creditTypesTreatment': 'EXCLUDE_ALL_CREDITS', 'calendarPeriod': 'MONTH'},
        'amount': {'specifiedAmount': {'currencyCode': 'JPY', 'units': '500', 'nanos': 0}},
        'thresholdRules': [{'thresholdPercent': p} for p in [.5, .8, 1]],
        'notificationsRule': {'enableProjectLevelRecipients': True},
        'spendCap': {'inputState': 'CONFIGURED'},
    }
    if matches:
        if len(matches) != 1:
            raise SystemExit('Duplicate budget names; inspect rather than create another.')
        created = request('https://billingbudgets.googleapis.com/v1/' + matches[0]['name'])
    else:
        created = request(base, payload)
    verified = request('https://billingbudgets.googleapis.com/v1/' + created['name'])
    amount = verified.get('amount', {}).get('specifiedAmount', {})
    project_number = gcloud('projects', 'describe', PROJECT, '--format=value(projectNumber)', capture=True).stdout.strip()
    filters = verified.get('budgetFilter', {})
    scoped_projects = filters.get('projects', [])
    if (amount.get('currencyCode') != 'JPY' or amount.get('units') != '500'
            or verified.get('spendCap', {}).get('outputState') != 'CONFIGURED'
            or scoped_projects not in [['projects/' + PROJECT], ['projects/' + project_number]]
            or filters.get('services') != ['services/152E-C115-5142']):
        raise SystemExit('Spend cap not verified; do not deploy.')
    (ROOT / '.private/cloud-run-budget.json').write_text(json.dumps(verified, indent=2))
    print(json.dumps({k: verified.get(k) for k in ['displayName', 'amount', 'spendCap']}, ensure_ascii=False))


if __name__ == '__main__':
    main()
