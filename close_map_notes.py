"""Add a pinned "Property Map" note (satellite photo + area map + links) and a Map link field to Close leads.

Usage:
  .venv/bin/python close_map_notes.py --lead lead_xxx      # one lead
  .venv/bin/python close_map_notes.py --all                # every lead that doesn't have one yet
  .venv/bin/python close_map_notes.py --lead lead_xxx --redo   # replace an existing map note
"""
import argparse
import io
import json
import math
import os
import re
import sys
import time
from html import escape
from urllib.parse import quote_plus

import requests
from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
# On GitHub the key comes from the CLOSE_API_KEY secret; on the Mac from close-key.txt
KEY = os.environ.get('CLOSE_API_KEY') or open(os.path.join(HERE, 'close-key.txt')).read().strip()
STATE_FILE = os.path.join(HERE, 'map-notes-state.json')
GEO_FILE = os.path.join(HERE, 'geocode-cache.json')
API = 'https://api.close.com/api/v1/'
MAP_FIELD = 'Map'
NOTE_MARK = '📍 Property Map'

s = requests.Session()
s.auth = (KEY, '')


def api(method, path, **kw):
    for attempt in range(5):
        r = s.request(method, API + path, timeout=30, **kw)
        if r.status_code == 429:
            time.sleep(float(r.headers.get('retry-after', 2)))
            continue
        if not r.ok:
            raise RuntimeError(f'{method} {path} -> {r.status_code}: {r.text[:300]}')
        return r.json() if r.text else {}
    raise RuntimeError('rate limited')


def load(path, default):
    try:
        return json.load(open(path))
    except (FileNotFoundError, json.JSONDecodeError):
        return default


def save(path, data):
    json.dump(data, open(path, 'w'), indent=1)


def lead_address(lead):
    for a in lead.get('addresses') or []:
        parts = [p for p in (a.get('address_1'), a.get('address_2')) if p]
        street = ', '.join(parts)
        # Some imports put the full "street, city, ST zip" into one line
        if street and re.search(r',\s*[A-Za-z .]+,?\s*[A-Z]{2}\s*\d{5}', street):
            return street
        if street or a.get('city'):
            tail = ' '.join(p for p in (a.get('state'), a.get('zipcode')) if p)
            return ', '.join(p for p in (street, (a.get('city') or '').title(), tail) if p)
    name = lead.get('display_name') or ''
    if re.match(r'^\d+\s+\S+', name) and re.search(r',\s*[A-Z]{2}\b', name):
        return name
    return None


def geocode(addr, cache):
    k = addr.lower()
    if k in cache:
        return cache[k]
    pt = None
    try:
        r = requests.get('https://geocoding.geo.census.gov/geocoder/locations/onelineaddress',
                         params={'address': addr, 'benchmark': 'Public_AR_Current', 'format': 'json'}, timeout=30).json()
        m = r['result']['addressMatches']
        if m:
            pt = [m[0]['coordinates']['y'], m[0]['coordinates']['x']]
    except Exception:
        pass
    if not pt:
        try:
            r = requests.get('https://nominatim.openstreetmap.org/search',
                             params={'q': addr, 'format': 'json', 'limit': 1, 'countrycodes': 'us'},
                             headers={'User-Agent': 'acorn-close-maps/1.0'}, timeout=30).json()
            if r:
                pt = [float(r[0]['lat']), float(r[0]['lon'])]
            time.sleep(1.1)
        except Exception:
            pass
    cache[k] = pt
    return pt


def esri_image(service, lat, lng, half_width_m, w, h):
    # lat/lng bbox centred on the house, sized in metres
    dlng = half_width_m / (111320 * math.cos(math.radians(lat)))
    dlat = half_width_m * h / w / 110540
    # Esri refuses more detail than ~0.3 m/pixel, so fetch smaller and scale up
    rw = min(w, int(2 * half_width_m / 0.3))
    rh = int(rw * h / w)
    url = (f'https://server.arcgisonline.com/ArcGIS/rest/services/{service}/MapServer/export'
           f'?bbox={lng - dlng},{lat - dlat},{lng + dlng},{lat + dlat}&bboxSR=4326&imageSR=3857&size={rw},{rh}&format=jpg&f=image')
    r = requests.get(url, timeout=60)
    r.raise_for_status()
    return Image.open(io.BytesIO(r.content)).convert('RGB').resize((w, h), Image.LANCZOS)


def draw_pin(img):
    d = ImageDraw.Draw(img)
    cx, cy = img.width // 2, img.height // 2
    r = 16
    d.polygon([(cx - r * 0.75, cy - r * 1.7), (cx + r * 0.75, cy - r * 1.7), (cx, cy)], fill='#e5484d', outline='white')
    d.ellipse([cx - r, cy - r * 3, cx + r, cy - r], fill='#e5484d', outline='white', width=3)
    d.ellipse([cx - 6, cy - r * 2 - 6, cx + 6, cy - r * 2 + 6], fill='white')


def font(size):
    for f in ('/System/Library/Fonts/Supplemental/Arial Bold.ttf', '/System/Library/Fonts/Helvetica.ttc'):
        try:
            return ImageFont.truetype(f, size)
        except OSError:
            continue
    return ImageFont.load_default()


def build_image(addr, lat, lng):
    sat = esri_image('World_Imagery', lat, lng, 70, 900, 600)       # the house + neighbours
    area = esri_image('World_Street_Map', lat, lng, 900, 450, 600)  # neighbourhood
    draw_pin(sat)
    draw_pin(area)
    out = Image.new('RGB', (1350, 660), 'white')
    out.paste(sat, (0, 0))
    out.paste(area, (900, 0))
    d = ImageDraw.Draw(out)
    d.rectangle([0, 600, 1350, 660], fill='#1f2328')
    d.text((18, 614), addr, fill='white', font=font(26))
    d.text((1180, 620), 'Area map', fill='#bbbbbb', font=font(20))
    buf = io.BytesIO()
    out.save(buf, 'JPEG', quality=85)
    return buf.getvalue()


def upload(filename, data, content_type='image/jpeg'):
    meta = api('POST', 'files/upload/', json={'filename': filename, 'content_type': content_type})
    up = meta['upload']
    r = requests.post(up['url'], data=up['fields'], files={'file': (filename, data, content_type)}, timeout=60)
    r.raise_for_status()
    return meta['download']['url']


def map_field_id():
    for f in api('GET', 'custom_field/lead/?_limit=200')['data']:
        if f['name'] == MAP_FIELD:
            return f['id']
    return api('POST', 'custom_field/lead/', json={'name': MAP_FIELD, 'type': 'text'})['id']


def links(addr, pt):
    q = quote_plus(addr)
    sv = (f'https://www.google.com/maps/@?api=1&map_action=pano&viewpoint={pt[0]},{pt[1]}'
          if pt else f'https://www.google.com/maps/search/?api=1&query={q}')
    return [
        ('🗺 Google Maps', f'https://www.google.com/maps/search/?api=1&query={q}'),
        ('🚶 Street View', sv),
        ('🏠 Zillow', f'https://www.zillow.com/homes/{q.replace("+", "-")}_rb/'),
        ('🏠 Propwire', f'https://propwire.com/search?q={q}'),
    ]


def process(lead, field_id, state, geo, redo=False):
    lid = lead['id']
    addr = lead_address(lead)
    if not addr:
        return 'no address'
    if lid in state and not redo:
        return 'already done'
    if lid in state and redo:
        try:
            api('DELETE', f"activity/note/{state[lid]['note_id']}/")
        except RuntimeError:
            pass
    pt = geocode(addr, geo)
    save(GEO_FILE, geo)
    gmaps = f'https://www.google.com/maps/search/?api=1&query={quote_plus(addr)}'
    attachments = []
    img_html = ''
    if pt:
        img_url = upload('property-map.jpg', build_image(addr, *pt))
        attachments = [{'url': img_url, 'filename': 'property-map.jpg', 'content_type': 'image/jpeg'}]
        img_html = f'<p><img src="{escape(img_url)}" alt="Property map"/></p>'
    link_html = ' &nbsp;|&nbsp; '.join(f'<a href="{escape(u)}">{t}</a>' for t, u in links(addr, pt))
    html = f'<body><p><strong>{NOTE_MARK}</strong> — {escape(addr)}</p>{img_html}<p>{link_html}</p></body>'
    note = api('POST', 'activity/note/', json={'lead_id': lid, 'note_html': html, 'attachments': attachments})
    # Close stores the attachment permanently; point the inline photo at that copy instead of the temporary upload
    saved = (note.get('attachments') or [{}])[0].get('url')
    if pt and saved:
        note = api('PUT', f"activity/note/{note['id']}/", json={'note_html': html.replace(escape(img_url), escape(saved))})
    try:
        api('PUT', f"activity/note/{note['id']}/", json={'pinned': True})
    except RuntimeError as e:
        print('  (could not pin:', e, ')')
    api('PUT', f'lead/{lid}/', json={f'custom.{field_id}': gmaps})
    state[lid] = {'note_id': note['id'], 'addr': addr, 'pt': pt}
    save(STATE_FILE, state)
    return 'ok' if pt else 'ok (address not found on map, links only)'


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--lead')
    ap.add_argument('--all', action='store_true')
    ap.add_argument('--redo', action='store_true')
    a = ap.parse_args()
    if not (a.lead or a.all):
        ap.error('use --lead ID or --all')
    state, geo = load(STATE_FILE, {}), load(GEO_FILE, {})
    field_id = map_field_id()
    fields = '_fields=id,display_name,addresses'
    if a.lead:
        leads = [api('GET', f'lead/{a.lead}/?{fields}')]
    else:
        leads, skip = [], 0
        while True:
            r = api('GET', f'lead/?{fields}&_limit=100&_skip={skip}')
            leads += r['data']
            skip += 100
            if not r['has_more']:
                break
    for lead in leads:
        try:
            res = process(lead, field_id, state, geo, a.redo)
        except Exception as e:
            res = f'ERROR {e}'
        print(f"{lead['display_name'][:60]:60}  {res}", flush=True)


if __name__ == '__main__':
    sys.exit(main())
