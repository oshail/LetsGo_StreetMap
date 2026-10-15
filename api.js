/* SCRIPT 1 — data layer: fetch API calls, JSON handling, opening-hours parsing */
const API = (() => {
  const CATS = {
    cafe: ['☕', 'Cafés', '#f59e0b', 'amenity', 'cafe'],
    food: ['🍜', 'Food', '#ef4444', 'amenity', 'restaurant|fast_food'],
    pharmacy: ['💊', 'Pharmacy', '#10b981', 'amenity', 'pharmacy'],
    hospital: ['🏥', 'Health', '#f43f5e', 'amenity', 'hospital|clinic'],
    atm: ['🏧', 'ATMs', '#6366f1', 'amenity', 'atm'],
    toilets: ['🚻', 'Toilets', '#0ea5e9', 'amenity', 'toilets'],
    park: ['🌳', 'Parks', '#22c55e', 'leisure', 'park'],
    transit: ['🚏', 'Bus stops', '#a855f7', 'highway', 'bus_stop']
  };
  async function getJSON(url, opts = {}, ms = 20000) {
    const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), ms);
    try {
      const r = await fetch(url, { ...opts, signal: ctl.signal });
      if (!r.ok) throw new Error(r.status === 429 ? 'Too many requests – please wait a few seconds.' : `Server error (${r.status}).`);
      return await r.json();
    } catch (e) {
      if (e.name === 'AbortError') throw new Error('The request timed out.');
      if (e instanceof TypeError) throw new Error('Network problem – check your connection.');
      if (e instanceof SyntaxError) throw new Error('Received unreadable data from the server.');
      throw e;
    } finally { clearTimeout(t); }
  }
  const geocode = q => getJSON('https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&addressdetails=1&polygon_geojson=1&polygon_threshold=0.01&accept-language=en&q=' + encodeURIComponent(q));
  function measure(p, c) {
    const R = 6371000, rad = d => d * Math.PI / 180;
    const a = Math.sin(rad(p.lat - c.lat) / 2) ** 2 + Math.cos(rad(c.lat)) * Math.cos(rad(p.lat)) * Math.sin(rad(p.lon - c.lon) / 2) ** 2;
    const dist = Math.round(2 * R * Math.asin(Math.sqrt(a)));
    return { dist, walk: Math.max(1, Math.round(dist / 80)) };
  }
  // tiny opening_hours interpreter: handles "24/7", "Mo-Sa 09:00-18:00; Su off", lists; returns true/false/null(unknown)
  function openNow(h, d = new Date()) {
    if (!h) return null;
    if (h.trim() === '24/7') return true;
    const D = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'], today = d.getDay(), cur = d.getHours() * 60 + d.getMinutes();
    const dayHit = s => !s.trim() || s.split(',').some(x => {
      const [a, b] = x.trim().split('-').map(v => D.indexOf(v.slice(0, 2)));
      if (a < 0) return false; if (b === undefined || x.indexOf('-') < 0) return a === today;
      return a <= b ? today >= a && today <= b : today >= a || today <= b;
    });
    let res = null;
    for (const rule of h.split(';')) {
      const m = rule.trim().match(/^([A-Za-z,\- ]*?)\s*((?:\d{1,2}:\d{2}-\d{1,2}:\d{2}(?:\s*,\s*)?)+|off)$/);
      if (!m) continue;
      if (!dayHit(m[1])) continue;
      if (m[2] === 'off') { res = false; continue; }
      res = m[2].split(',').some(r => {
        const [s, e] = r.trim().split('-').map(t => { const [H, M] = t.split(':'); return +H * 60 + +M; });
        return e > s ? cur >= s && cur < e : cur >= s || cur < e;
      });
    }
    return res;
  }
  const MIRRORS = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter', 'https://overpass.private.coffee/api/interpreter'];
  const cache = new Map();
  async function nearby(c, radius, cat) {
    const key = [c.lat.toFixed(4), c.lon.toFixed(4), radius, cat].join();
    if (cache.has(key)) return cache.get(key);
    const [, label, , k, v] = CATS[cat], f = `["${k}"~"^(${v})$"]`, a = `(around:${radius},${c.lat},${c.lon})`;
    const q = `[out:json][timeout:20];(node${a}${f};way${a}${f};);out center tags 50;`;
    let j;
    try { j = await Promise.any(MIRRORS.map(u => getJSON(u, { method: 'POST', body: 'data=' + encodeURIComponent(q) }, 22000))); }
    catch (e) { throw new Error('The map-data servers are busy right now. Tap “Try again” in a few seconds.'); }
    if (!j || !Array.isArray(j.elements)) throw new Error('Unexpected response from map server.');
    if (j.remark && !j.elements.length) throw new Error('The map-data server was too busy. Tap “Try again”.');
    const out = j.elements.map(e => {
      const lat = e.lat ?? e.center?.lat, lon = e.lon ?? e.center?.lon, t = e.tags || {};
      if (lat == null) return null;
      const p = { id: e.type[0] + e.id, name: t['name:en'] || t.name || label.replace(/s$/, '') + ' (unnamed)', lat, lon, cat, hours: t.opening_hours || '', wheel: t.wheelchair || '', open: openNow(t.opening_hours), phone: t.phone || t['contact:phone'] || '' };
      return { ...p, ...measure(p, c) };
    }).filter(Boolean);
    cache.set(key, out); return out;
  }
  async function route(a, b) {
    const j = await getJSON(`https://router.project-osrm.org/route/v1/foot/${a.lon},${a.lat};${b.lon},${b.lat}?overview=full&geometries=geojson`);
    if (!j.routes?.length) throw new Error('No walking route found.');
    return { geo: j.routes[0].geometry, km: (j.routes[0].distance / 1000).toFixed(2), min: Math.max(1, Math.round(j.routes[0].distance / 80)) };
  }
  async function reportNote(lat, lon, text) {
    const j = await getJSON('https://api.openstreetmap.org/api/0.6/notes.json', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ lat, lon, text }) });
    return j.properties?.id;
  }
  return { CATS, geocode, nearby, route, measure, reportNote };
})();
