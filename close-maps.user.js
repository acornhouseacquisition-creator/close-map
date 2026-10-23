// ==UserScript==
// @name         Close Maps (Acorn)
// @namespace    acornhouseacquisition
// @version      1.0.0
// @description  Adds a property map inside every Close lead + a full map of all leads
// @match        https://app.close.com/*
// @require      https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.js
// @require      https://cdnjs.cloudflare.com/ajax/libs/leaflet.markercluster/1.5.3/leaflet.markercluster.js
// @resource     LEAFLET_CSS https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.css
// @resource     CLUSTER_CSS https://cdnjs.cloudflare.com/ajax/libs/leaflet.markercluster/1.5.3/MarkerCluster.css
// @resource     CLUSTER_CSS2 https://cdnjs.cloudflare.com/ajax/libs/leaflet.markercluster/1.5.3/MarkerCluster.Default.css
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_addStyle
// @grant        GM_getResourceText
// @connect      api.close.com
// @connect      geocoding.geo.census.gov
// @connect      nominatim.openstreetmap.org
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  const MAX_LEADS = 3000;
  const GEO_CONCURRENCY = 4;

  // ---------- styles ----------
  try {
    GM_addStyle(GM_getResourceText('LEAFLET_CSS'));
    GM_addStyle(GM_getResourceText('CLUSTER_CSS'));
    GM_addStyle(GM_getResourceText('CLUSTER_CSS2'));
  } catch (e) { /* test harness loads CSS itself */ }

  GM_addStyle(`
    #acm-lead-card{margin:12px 0;border:1px solid #e3e5e8;border-radius:8px;background:#fff;overflow:hidden;font-family:inherit}
    #acm-lead-card .acm-head{display:flex;align-items:center;justify-content:space-between;padding:10px 14px;background:#f4f5f7;font-size:13px;font-weight:600;letter-spacing:.04em;text-transform:uppercase;color:#1f2328}
    #acm-lead-card .acm-tabs button{border:1px solid #d0d4d9;background:#fff;font-size:12px;padding:3px 9px;cursor:pointer;color:#333}
    #acm-lead-card .acm-tabs button:first-child{border-radius:6px 0 0 6px}
    #acm-lead-card .acm-tabs button:last-child{border-radius:0 6px 6px 0;border-left:0}
    #acm-lead-card .acm-tabs button.on{background:#1f6feb;color:#fff;border-color:#1f6feb}
    #acm-lead-card iframe{display:block;width:100%;height:320px;border:0}
    #acm-lead-card .acm-addr{padding:8px 14px;font-size:13px;color:#444;border-top:1px solid #eee}
    #acm-lead-card .acm-links{display:flex;flex-wrap:wrap;gap:6px;padding:0 14px 12px}
    .acm-links a{font-size:12px;padding:4px 9px;border-radius:999px;background:#eef3fd;color:#1f6feb;text-decoration:none;white-space:nowrap}
    .acm-links a:hover{background:#dbe7fc}

    #acm-fab{position:fixed;right:100px;bottom:26px;z-index:99998;background:#1f2328;color:#fff;border:0;border-radius:999px;padding:10px 16px;font-size:14px;font-weight:600;cursor:pointer;box-shadow:0 4px 14px rgba(0,0,0,.25)}
    #acm-fab:hover{background:#1f6feb}

    #acm-overlay{position:fixed;inset:0;z-index:99999;background:#fff;display:flex;flex-direction:column;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;color:#1f2328}
    #acm-overlay .acm-bar{display:flex;align-items:center;gap:10px;padding:10px 14px;border-bottom:1px solid #e3e5e8;flex-wrap:wrap}
    #acm-overlay .acm-bar h2{margin:0 8px 0 0;font-size:17px}
    #acm-overlay input[type=search]{padding:7px 10px;border:1px solid #d0d4d9;border-radius:6px;font-size:14px;width:240px}
    #acm-overlay select,#acm-overlay .acm-btn{padding:7px 10px;border:1px solid #d0d4d9;border-radius:6px;font-size:13px;background:#fff;cursor:pointer;color:#1f2328}
    #acm-overlay .acm-btn:hover{background:#f4f5f7}
    #acm-overlay .acm-status{font-size:13px;color:#666;margin-left:auto}
    #acm-overlay .acm-body{flex:1;display:flex;min-height:0}
    #acm-overlay .acm-list{width:320px;overflow:auto;border-right:1px solid #e3e5e8}
    #acm-overlay .acm-item{padding:10px 14px;border-bottom:1px solid #f0f0f0;cursor:pointer}
    #acm-overlay .acm-item:hover{background:#f6f8fa}
    #acm-overlay .acm-item b{display:block;font-size:13px}
    #acm-overlay .acm-item small{color:#666;font-size:12px}
    #acm-overlay .acm-dot{display:inline-block;width:9px;height:9px;border-radius:50%;margin-right:6px;vertical-align:middle}
    #acm-overlay .acm-map{flex:1}
    #acm-overlay .acm-chips{display:flex;flex-wrap:wrap;gap:6px;padding:8px 14px;border-bottom:1px solid #e3e5e8}
    #acm-overlay .acm-chip{font-size:12px;padding:3px 9px;border-radius:999px;border:1px solid #d0d4d9;cursor:pointer;user-select:none;background:#fff}
    #acm-overlay .acm-chip.off{opacity:.35}
    .acm-pin{display:flex;align-items:flex-start;gap:4px;white-space:nowrap;pointer-events:auto}
    .acm-pin i{flex:none;width:16px;height:16px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.4)}
    .acm-pin span{font:600 11px/1.25 -apple-system,sans-serif;background:rgba(255,255,255,.92);padding:2px 5px;border-radius:4px;box-shadow:0 1px 3px rgba(0,0,0,.25);color:#1f2328}
    .acm-pin span em{display:block;font-style:normal;font-weight:700;color:#0a7d32}
    .acm-nolabels .acm-pin span{display:none}
    .acm-pop{font:13px/1.4 -apple-system,sans-serif;min-width:240px;max-width:300px}
    .acm-pop h3{margin:0 0 4px;font-size:14px}
    .acm-pop .acm-badge{display:inline-block;font-size:11px;padding:2px 7px;border-radius:999px;color:#fff;margin-bottom:6px}
    .acm-pop table{border-collapse:collapse;width:100%;margin:4px 0}
    .acm-pop td{padding:2px 0;vertical-align:top;font-size:12px}
    .acm-pop td:first-child{color:#777;padding-right:8px;white-space:nowrap}
    .acm-pop p{margin:6px 0;font-size:12px;color:#444;max-height:90px;overflow:auto}
    .acm-pop .acm-open{display:inline-block;margin-top:6px;padding:5px 10px;background:#1f6feb;color:#fff!important;border-radius:6px;text-decoration:none;font-weight:600}
    @media (max-width:700px){#acm-overlay .acm-list{display:none}}
  `);

  // ---------- helpers ----------
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const enc = encodeURIComponent;
  const PALETTE = ['#e5484d', '#1f6feb', '#30a46c', '#f76b15', '#8e4ec6', '#0090ff', '#d6409f', '#ad7f58', '#12a594', '#e5a000', '#5b5bd6', '#687076'];
  const colorFor = (label) => {
    let h = 0;
    for (const c of String(label || '')) h = (h * 31 + c.charCodeAt(0)) >>> 0;
    return PALETTE[h % PALETTE.length];
  };

  function gmRequest(opts) {
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: opts.method || 'GET',
        url: opts.url,
        headers: opts.headers || {},
        timeout: 20000,
        onload: (r) => (r.status >= 200 && r.status < 300 ? resolve(JSON.parse(r.responseText)) : reject(new Error('HTTP ' + r.status))),
        onerror: () => reject(new Error('network error')),
        ontimeout: () => reject(new Error('timeout')),
      });
    });
  }

  // ---------- Close API ----------
  // First try the logged-in browser session; if Close refuses it, fall back to an API key.
  let authMode = null; // 'session' | 'key'
  async function closeGet(path) {
    if (authMode !== 'key') {
      const r = await fetch('/api/v1/' + path, { credentials: 'include', headers: { Accept: 'application/json' } });
      if (r.ok) { authMode = 'session'; return r.json(); }
      if (authMode === 'session') throw new Error('Close API ' + r.status);
    }
    let key = GM_getValue('apiKey', '');
    if (!key) {
      key = (prompt('Close Maps needs your Close API key once (Settings → Developer → API Keys).\nIt is stored only in Tampermonkey on this computer.') || '').trim();
      if (!key) throw new Error('No API key');
      GM_setValue('apiKey', key);
    }
    authMode = 'key';
    return gmRequest({ url: 'https://api.close.com/api/v1/' + path, headers: { Authorization: 'Basic ' + btoa(key + ':'), Accept: 'application/json' } });
  }

  function leadAddress(lead) {
    const a = (lead.addresses || [])[0];
    if (a && (a.address_1 || a.city)) {
      return [a.address_1, a.address_2, a.city, [a.state, a.zipcode].filter(Boolean).join(' ')].filter(Boolean).join(', ');
    }
    // Lead names are often the property address ("100 Main St, Columbus, OH 43215")
    const n = lead.display_name || lead.name || '';
    if (/^\d+\s+\S+/.test(n) && /,\s*[A-Za-z .]+,?\s*[A-Z]{2}\b/.test(n)) return n;
    return null;
  }

  let fieldNames = null;
  async function loadFieldNames() {
    if (fieldNames) return fieldNames;
    fieldNames = {};
    try {
      const r = await closeGet('custom_field/lead/?_limit=200');
      (r.data || []).forEach((f) => { fieldNames['custom.' + f.id] = f.name; });
    } catch (e) { /* names are optional */ }
    return fieldNames;
  }

  function customFields(lead) {
    const out = {};
    for (const [k, v] of Object.entries(lead)) {
      if (k.startsWith('custom.') && v != null && v !== '') out[fieldNames[k] || k.slice(7)] = Array.isArray(v) ? v.join(', ') : v;
    }
    if (lead.custom && typeof lead.custom === 'object') {
      for (const [k, v] of Object.entries(lead.custom)) if (v != null && v !== '' && !(k in out)) out[k] = Array.isArray(v) ? v.join(', ') : v;
    }
    return out;
  }

  function priceFor(lead, cf) {
    const opp = (lead.opportunities || []).find((o) => o.value);
    if (opp) return opp.value_formatted || '$' + Math.round(opp.value / 100).toLocaleString();
    const k = Object.keys(cf).find((n) => /price|offer|asking|arv|value/i.test(n) && /\d/.test(String(cf[n])));
    if (!k) return '';
    const num = Number(String(cf[k]).replace(/[^\d.]/g, ''));
    return num ? '$' + Math.round(num).toLocaleString() : String(cf[k]);
  }

  // ---------- geocoding (cached forever in Tampermonkey storage) ----------
  async function geocode(addr) {
    const ck = 'geo:' + addr.toLowerCase();
    const cached = GM_getValue(ck, null);
    if (cached) return cached === 'none' ? null : cached;
    let pt = null;
    try {
      const r = await gmRequest({ url: 'https://geocoding.geo.census.gov/geocoder/locations/onelineaddress?benchmark=Public_AR_Current&format=json&address=' + enc(addr) });
      const m = r.result && r.result.addressMatches && r.result.addressMatches[0];
      if (m) pt = [m.coordinates.y, m.coordinates.x];
    } catch (e) { /* try next */ }
    if (!pt) {
      try {
        const r = await gmRequest({ url: 'https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=us&q=' + enc(addr) });
        if (r[0]) pt = [Number(r[0].lat), Number(r[0].lon)];
        await new Promise((res) => setTimeout(res, 1100)); // Nominatim allows 1 req/sec
      } catch (e) { /* give up */ }
    }
    GM_setValue(ck, pt || 'none');
    return pt;
  }

  // ---------- map inside each lead ----------
  const leadCache = {};
  function currentLeadId() {
    const m = location.pathname.match(/\/lead\/(lead_[A-Za-z0-9]+)/);
    return m ? m[1] : null;
  }

  function findSidebarAnchor() {
    // The left column's last section is "Custom Fields"; insert the map right below it.
    const heads = [...document.querySelectorAll('h1,h2,h3,h4,h5,h6,span,div,button')].filter(
      (el) => el.childElementCount === 0 && /^\s*custom fields\s*$/i.test(el.textContent)
    );
    for (const h of heads) {
      let el = h;
      while (el.parentElement && !/opportunities/i.test(el.parentElement.textContent)) el = el.parentElement;
      if (el.parentElement && el !== document.body) return el;
    }
    return null;
  }

  function leadLinks(addr, cls) {
    const q = enc(addr);
    return `<div class="${cls}">
      <a href="https://www.google.com/maps/search/?api=1&query=${q}" target="_blank" rel="noopener">Google Maps</a>
      <a href="https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=" data-acm-sv="${esc(addr)}" target="_blank" rel="noopener">Street View</a>
      <a href="https://www.zillow.com/homes/${q}_rb/" target="_blank" rel="noopener">Zillow</a>
      <a href="https://www.redfin.com/search?q=${q}" target="_blank" rel="noopener">Redfin</a>
      <a href="https://www.realtor.com/realestateandhomes-search/${q}" target="_blank" rel="noopener">Realtor</a>
    </div>`;
  }

  // Street View needs coordinates; resolve them on click.
  document.addEventListener('click', async (e) => {
    const a = e.target.closest && e.target.closest('a[data-acm-sv]');
    if (!a) return;
    e.preventDefault();
    const w = window.open('about:blank', '_blank');
    const pt = await geocode(a.dataset.acmSv);
    const url = pt
      ? `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${pt[0]},${pt[1]}`
      : `https://www.google.com/maps/search/?api=1&query=${enc(a.dataset.acmSv)}`;
    if (w) w.location = url; else window.open(url, '_blank');
  }, true);

  function buildLeadCard(addr) {
    const card = document.createElement('div');
    card.id = 'acm-lead-card';
    const src = (t) => `https://maps.google.com/maps?q=${enc(addr)}&t=${t}&z=${t === 'k' ? 19 : 16}&output=embed`;
    card.innerHTML = `
      <div class="acm-head">📍 Property Map
        <span class="acm-tabs"><button data-t="k" class="on">Satellite</button><button data-t="m">Map</button></span>
      </div>
      <iframe loading="lazy" referrerpolicy="no-referrer-when-downgrade" src="${src('k')}"></iframe>
      <div class="acm-addr">${esc(addr)}</div>
      ${leadLinks(addr, 'acm-links')}`;
    card.querySelectorAll('.acm-tabs button').forEach((b) => b.addEventListener('click', () => {
      card.querySelectorAll('.acm-tabs button').forEach((x) => x.classList.toggle('on', x === b));
      card.querySelector('iframe').src = src(b.dataset.t);
    }));
    return card;
  }

  let leadBusy = false;
  async function ensureLeadCard() {
    const id = currentLeadId();
    const existing = document.getElementById('acm-lead-card');
    if (!id) { if (existing) existing.remove(); return; }
    if (existing && existing.dataset.lead === id && document.body.contains(existing)) return;
    if (leadBusy) return;
    const anchor = findSidebarAnchor();
    if (!anchor) return; // page not rendered yet, retry on next tick
    leadBusy = true;
    try {
      if (!(id in leadCache)) {
        let addr = null;
        try { addr = leadAddress(await closeGet(`lead/${id}/?_fields=id,display_name,name,addresses`)); }
        catch (e) { addr = leadAddress({ display_name: document.title.replace(/\s*[|–-]\s*Close.*$/i, '') }); }
        leadCache[id] = addr;
      }
      if (existing) existing.remove();
      if (currentLeadId() !== id || !leadCache[id]) return;
      const card = buildLeadCard(leadCache[id]);
      card.dataset.lead = id;
      anchor.insertAdjacentElement('afterend', card);
    } finally { leadBusy = false; }
  }

  // ---------- map of all leads ----------
  let overlay = null, map = null, cluster = null, allItems = [], hiddenStatuses = new Set(GM_getValue('hiddenStatuses', []));

  function addFab() {
    if (document.getElementById('acm-fab')) return;
    const b = document.createElement('button');
    b.id = 'acm-fab';
    b.textContent = '🗺  Map';
    b.title = 'Map of all leads';
    b.addEventListener('click', openOverlay);
    document.body.appendChild(b);
  }

  function setStatus(t) { const s = overlay && overlay.querySelector('.acm-status'); if (s) s.textContent = t; }

  function openOverlay() {
    if (overlay) { overlay.style.display = 'flex'; setTimeout(() => map.invalidateSize(), 50); return; }
    overlay = document.createElement('div');
    overlay.id = 'acm-overlay';
    overlay.innerHTML = `
      <div class="acm-bar">
        <h2>🗺 Lead Map</h2>
        <input type="search" placeholder="Search address, name, status…">
        <select class="acm-base"><option value="street">Street</option><option value="sat">Satellite</option></select>
        <label style="font-size:13px"><input type="checkbox" class="acm-labels" checked> Labels</label>
        <button class="acm-btn acm-refresh">↻ Refresh</button>
        <button class="acm-btn acm-key" title="Set or clear Close API key">⚙</button>
        <span class="acm-status">Loading…</span>
        <button class="acm-btn acm-close">✕ Close</button>
      </div>
      <div class="acm-chips"></div>
      <div class="acm-body"><div class="acm-list"></div><div class="acm-map"></div></div>`;
    document.body.appendChild(overlay);

    const street = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19, attribution: '© Esri' });
    const sat = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19, attribution: '© Esri' });
    map = L.map(overlay.querySelector('.acm-map'), { layers: [street] }).setView([38.5, -81], 6);
    cluster = L.markerClusterGroup({ maxClusterRadius: 40, disableClusteringAtZoom: 12, showCoverageOnHover: false });
    map.addLayer(cluster);

    overlay.querySelector('.acm-close').onclick = () => { overlay.style.display = 'none'; };
    overlay.querySelector('.acm-refresh').onclick = () => loadAll();
    overlay.querySelector('.acm-key').onclick = () => {
      const k = prompt('Close API key (leave empty to clear):', GM_getValue('apiKey', ''));
      if (k !== null) { GM_setValue('apiKey', k.trim()); authMode = null; }
    };
    overlay.querySelector('.acm-base').onchange = (e) => {
      if (e.target.value === 'sat') { map.removeLayer(street); sat.addTo(map); } else { map.removeLayer(sat); street.addTo(map); }
    };
    overlay.querySelector('.acm-labels').onchange = (e) => overlay.querySelector('.acm-map').classList.toggle('acm-nolabels', !e.target.checked);
    overlay.querySelector('input[type=search]').oninput = render;
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && overlay.style.display !== 'none') overlay.style.display = 'none'; });
    loadAll();
  }

  function popupHtml(it) {
    const l = it.lead;
    const c = (l.contacts || [])[0];
    const phone = c && (c.phones || [])[0];
    const rows = [];
    if (it.price) rows.push(['Price', esc(it.price)]);
    if (c) rows.push(['Contact', esc(c.name || c.display_name) + (phone ? `<br><a href="tel:${esc(phone.phone)}">${esc(phone.phone_formatted || phone.phone)}</a>` : '')]);
    Object.entries(it.cf).slice(0, 8).forEach(([k, v]) => rows.push([esc(k), esc(v)]));
    const desc = l.description ? `<p>${esc(l.description).slice(0, 400)}</p>` : '';
    return `<div class="acm-pop">
      <h3>${esc(l.display_name)}</h3>
      <span class="acm-badge" style="background:${it.color}">${esc(l.status_label || 'No status')}</span>
      <div style="font-size:12px;color:#555">${esc(it.addr)}</div>
      <table>${rows.map((r) => `<tr><td>${r[0]}</td><td>${r[1]}</td></tr>`).join('')}</table>
      ${desc}
      <a class="acm-open" href="/lead/${esc(l.id)}/">Open lead →</a>
      ${leadLinks(it.addr, 'acm-links" style="padding:8px 0 0')}
    </div>`;
  }

  function makeMarker(it) {
    const label = esc(it.lead.display_name.split(',')[0]) + (it.price ? `<em>${esc(it.price)}</em>` : '');
    const icon = L.divIcon({ className: '', iconSize: null, iconAnchor: [8, 18], popupAnchor: [0, -18], html: `<div class="acm-pin"><i style="background:${it.color}"></i><span>${label}</span></div>` });
    it.marker = L.marker(it.pt, { icon }).bindPopup(() => popupHtml(it), { maxWidth: 320 });
  }

  function render() {
    if (!overlay) return;
    const q = overlay.querySelector('input[type=search]').value.trim().toLowerCase();
    const visible = allItems.filter((it) => it.pt && !hiddenStatuses.has(it.status) && (!q || it.search.includes(q)));

    // status chips
    const counts = {};
    allItems.forEach((it) => { counts[it.status] = (counts[it.status] || 0) + 1; });
    const chips = overlay.querySelector('.acm-chips');
    chips.innerHTML = Object.keys(counts).sort().map((s) =>
      `<span class="acm-chip ${hiddenStatuses.has(s) ? 'off' : ''}" data-s="${esc(s)}"><span class="acm-dot" style="background:${colorFor(s)}"></span>${esc(s)} (${counts[s]})</span>`).join('');
    chips.querySelectorAll('.acm-chip').forEach((ch) => ch.onclick = () => {
      const s = ch.dataset.s;
      hiddenStatuses.has(s) ? hiddenStatuses.delete(s) : hiddenStatuses.add(s);
      GM_setValue('hiddenStatuses', [...hiddenStatuses]);
      render();
    });

    cluster.clearLayers();
    cluster.addLayers(visible.map((it) => it.marker));

    const list = overlay.querySelector('.acm-list');
    list.innerHTML = visible.map((it, i) => `<div class="acm-item" data-i="${i}">
      <b><span class="acm-dot" style="background:${it.color}"></span>${esc(it.lead.display_name)}</b>
      <small>${esc(it.status)}${it.price ? ' · ' + esc(it.price) : ''}</small></div>`).join('') || '<div class="acm-item"><small>No leads match.</small></div>';
    list.querySelectorAll('.acm-item[data-i]').forEach((el) => el.onclick = () => {
      const it = visible[Number(el.dataset.i)];
      cluster.zoomToShowLayer(it.marker, () => it.marker.openPopup());
    });
  }

  let loading = false;
  async function loadAll() {
    if (loading) return;
    loading = true;
    try {
      setStatus('Loading leads from Close…');
      await loadFieldNames();
      const leads = [];
      for (let skip = 0; skip < MAX_LEADS; skip += 100) {
        const r = await closeGet(`lead/?_limit=100&_skip=${skip}`);
        leads.push(...(r.data || []));
        setStatus(`Loaded ${leads.length} leads…`);
        if (!r.has_more) break;
      }
      allItems = leads.map((lead) => {
        const addr = leadAddress(lead);
        if (!addr) return null;
        const cf = customFields(lead);
        const status = lead.status_label || 'No status';
        return { lead, addr, cf, status, color: colorFor(status), price: priceFor(lead, cf), pt: null,
          search: [lead.display_name, addr, status, ...Object.values(cf)].join(' ').toLowerCase() };
      }).filter(Boolean);

      let done = 0, missing = 0, fitted = false;
      const queue = allItems.slice();
      const worker = async () => {
        while (queue.length) {
          const it = queue.shift();
          it.pt = await geocode(it.addr);
          if (it.pt) makeMarker(it); else missing++;
          done++;
          if (done % 10 === 0 || done === allItems.length) {
            setStatus(`Locating houses ${done}/${allItems.length}…`);
            render();
          }
        }
      };
      await Promise.all(Array.from({ length: GEO_CONCURRENCY }, worker));
      render();
      const pts = allItems.filter((it) => it.pt).map((it) => it.pt);
      if (pts.length && !fitted) { map.fitBounds(pts, { padding: [40, 40], maxZoom: 14 }); fitted = true; }
      setStatus(`${pts.length} houses on map · ${leads.length - allItems.length} leads without address${missing ? ` · ${missing} address not found` : ''}`);
    } catch (e) {
      setStatus('Error: ' + e.message);
    } finally { loading = false; }
  }

  // ---------- boot (Close is a single-page app, so keep checking) ----------
  setInterval(() => { addFab(); ensureLeadCard(); }, 1000);
  addFab();
  ensureLeadCard();
})();
