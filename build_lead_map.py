"""Build the all-houses map: every Close lead with an address on one map.

  .venv/bin/python build_lead_map.py
      -> private/all-houses.html, a plain copy for this Mac (private/ is never uploaded)
  python build_lead_map.py --out _site/houses.html --encrypt
      -> password-locked copy; GitHub Actions runs this every 15 minutes (MAP_PASSWORD secret)
"""
import argparse
import base64
import datetime
import json
import os
from concurrent.futures import ThreadPoolExecutor

import close_map_notes as m

OUT_DIR = os.path.join(m.HERE, 'private')
TEMPLATE = os.path.join(m.HERE, 'all-houses.template.html')
LIVE_MAP = 'https://acornhouseacquisition-creator.github.io/close-map/map.html'

DOT_COLORS = {'🟢': 'green', '🟡': 'yellow', '🔴': 'red', '⚪': 'white', '🟠': 'orange', '🔵': 'blue', '🟣': 'purple'}


def fetch_leads():
    leads, skip = [], 0
    fields = 'id,display_name,status_label,addresses,contacts,opportunities,date_updated'
    while True:
        r = m.api('GET', f'lead/?_limit=100&_skip={skip}&_fields={fields}')
        leads += r['data']
        skip += 100
        if not r['has_more']:
            return leads


def tone(status):
    for dot, name in DOT_COLORS.items():
        if status.startswith(dot):
            return name
    return 'grey'


def record(lead, pt):
    c = (lead.get('contacts') or [{}])[0]
    opps = lead.get('opportunities') or []
    opp = next((o for o in opps if o.get('value')), opps[0] if opps else None)
    status = lead.get('status_label') or 'No status'
    return {
        'id': lead['id'],
        'addr': m.lead_address(lead),
        'pt': [round(pt[0], 6), round(pt[1], 6)],
        'status': status,
        'tone': tone(status),
        'name': c.get('name') or c.get('display_name') or '',
        'phones': [p.get('phone_formatted') or p.get('phone') for p in c.get('phones') or []],
        'emails': [e.get('email') for e in c.get('emails') or []],
        'opp': {'status': opp.get('status_label') or '', 'type': opp.get('status_type') or '',
                'value': opp.get('value_formatted') or ''} if opp else None,
        'updated': (lead.get('date_updated') or '')[:10],
    }


def encrypt(data, password):
    # Must match decrypt() in the template: PBKDF2-SHA256 -> AES-256-GCM
    from cryptography.hazmat.primitives import hashes
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM
    from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
    salt, iv, iterations = os.urandom(16), os.urandom(12), 600_000
    key = PBKDF2HMAC(algorithm=hashes.SHA256(), length=32, salt=salt, iterations=iterations).derive(password.encode())
    ct = AESGCM(key).encrypt(iv, json.dumps(data, ensure_ascii=False).encode(), None)
    b64 = lambda b: base64.b64encode(b).decode()
    return {'salt': b64(salt), 'iv': b64(iv), 'iter': iterations, 'ct': b64(ct)}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--out', default=os.path.join(OUT_DIR, 'all-houses.html'))
    ap.add_argument('--encrypt', action='store_true', help='lock with the MAP_PASSWORD environment variable')
    args = ap.parse_args()
    password = os.environ.get('MAP_PASSWORD', '')
    if args.encrypt and len(password) < 12:
        raise SystemExit('The MAP_PASSWORD secret is missing or shorter than 12 characters: '
                         'update it under Settings > Secrets and variables > Actions')

    geo = m.load(m.GEO_FILE, {})
    leads = [l for l in fetch_leads() if m.lead_address(l)]
    print(f'{len(leads)} leads with an address, locating…', flush=True)
    todo = [m.lead_address(l) for l in leads if m.lead_address(l).lower() not in geo]
    with ThreadPoolExecutor(6) as pool:
        # Census lookups run in parallel; the slower fallback only runs for misses
        list(pool.map(lambda a: m.geocode(a, geo), todo))
    if not args.encrypt:
        m.save(m.GEO_FILE, geo)  # the cache holds addresses, so it is only kept on the Mac
    rows, missing = [], []
    for l in leads:
        pt = geo.get(m.lead_address(l).lower())
        (rows.append(record(l, pt)) if pt else missing.append(m.lead_address(l)))
    data = {'leads': rows, 'missing': missing, 'liveMap': LIVE_MAP,
            'built': datetime.datetime.now(datetime.timezone.utc).isoformat()}
    if args.encrypt:
        data = encrypt(data, password)
    html = open(TEMPLATE).read().replace('/*__DATA__*/null', json.dumps(data, ensure_ascii=False))
    os.makedirs(os.path.dirname(os.path.abspath(args.out)), exist_ok=True)
    open(args.out, 'w').write(html)
    print(f'{len(rows)} on the map, {len(missing)} not found -> {args.out}')
    if not args.encrypt:
        for a in missing:
            print('  not found:', a)


if __name__ == '__main__':
    main()
