"""Build private/all-houses.html: every Close lead with an address on one map.

Usage:  .venv/bin/python build_lead_map.py
Then open private/all-houses.html in Safari. The private/ folder is never uploaded (see .gitignore).
"""
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
        'opp': {'status': opp.get('status_label') or '', 'value': opp.get('value_formatted') or ''} if opp else None,
        'updated': (lead.get('date_updated') or '')[:10],
    }


def main():
    geo = m.load(m.GEO_FILE, {})
    leads = [l for l in fetch_leads() if m.lead_address(l)]
    print(f'{len(leads)} leads with an address, locating…', flush=True)
    todo = [m.lead_address(l) for l in leads if m.lead_address(l).lower() not in geo]
    with ThreadPoolExecutor(6) as pool:
        # Census lookups run in parallel; the slower fallback only runs for misses
        list(pool.map(lambda a: m.geocode(a, geo), todo))
    m.save(m.GEO_FILE, geo)
    rows, missing = [], []
    for l in leads:
        pt = geo.get(m.lead_address(l).lower())
        (rows.append(record(l, pt)) if pt else missing.append(m.lead_address(l)))
    data = {'leads': rows, 'missing': missing, 'liveMap': LIVE_MAP}
    html = open(TEMPLATE).read().replace('/*__DATA__*/null', json.dumps(data, ensure_ascii=False))
    os.makedirs(OUT_DIR, exist_ok=True)
    out = os.path.join(OUT_DIR, 'all-houses.html')
    open(out, 'w').write(html)
    print(f'{len(rows)} on the map, {len(missing)} not found -> {out}')
    for a in missing:
        print('  not found:', a)


if __name__ == '__main__':
    main()
