/* SCRIPT 2 — map layer: Leaflet map with automatic tile-provider fallback, pins, radius ring, routes */
const MapView = (() => {
  const BASES = [
    ['Light', 'https://{s}.basemaps.cartocdn.com/rasterTiles/voyager/{z}/{x}/{y}{r}.png', { subdomains: 'abcd', maxZoom: 19, attribution: '© OpenStreetMap contributors © CARTO' }],
    ['Street', 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap contributors' }],
    ['Esri streets', 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19, attribution: 'Tiles © Esri' }],
    ['Satellite', 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 18, attribution: 'Tiles © Esri' }]
  ];
  let map, layer, routeLayer, ring, here;
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  function banner(msg, bad) {
    let d = document.getElementById('tileMsg');
    if (!d) { d = document.createElement('div'); d.id = 'tileMsg'; d.style.cssText = 'position:absolute;bottom:10px;right:60px;z-index:999;max-width:340px;font-size:12px;padding:8px 12px;border-radius:12px;box-shadow:0 4px 14px #0003'; document.getElementById('app').appendChild(d); }
    d.style.background = bad ? '#ffe4e6' : '#e0e7ff'; d.style.color = bad ? '#9f1239' : '#3730a3'; d.textContent = msg;
    if (!bad) setTimeout(() => d.remove(), 3500);
  }
  function init() {
    map = L.map('map', { zoomControl: false, worldCopyJump: true, minZoom: 2 }).setView([20, 10], 2);
    L.control.zoom({ position: 'bottomright' }).addTo(map);
    const base = {}; BASES.forEach(([n, u, o]) => base[n] = L.tileLayer(u, o));
    const names = Object.keys(base); let errs = 0, loaded = false;
    base[names[0]].addTo(map);
    L.control.layers(base, null, { position: 'bottomright' }).addTo(map);
    names.forEach((n, i) => {
      base[n].on('tileload', () => { loaded = true; errs = 0; const m = document.getElementById('tileMsg'); if (m) m.remove(); });
      base[n].on('tileerror', () => {
        if (loaded || !map.hasLayer(base[n]) || ++errs < 4) return;
        errs = 0; map.removeLayer(base[n]);
        if (i + 1 < names.length - 1) { base[names[i + 1]].addTo(map); banner('Map style “' + n + '” is blocked on your network – switching to “' + names[i + 1] + '”…'); }
        else banner('Map tiles couldn’t load from any provider. Check internet/VPN/ad-blocker, or open this page via http://localhost (run: python3 -m http.server 8000).', true);
      });
    });
    if (window.ResizeObserver) new ResizeObserver(() => map.invalidateSize()).observe(document.getElementById('map'));
    here = L.layerGroup().addTo(map); layer = L.layerGroup().addTo(map); routeLayer = L.layerGroup().addTo(map);
  }
  const icon = (p, saved) => { const [e, , col] = API.CATS[p.cat]; return L.divIcon({ className: '', iconSize: [34, 34], iconAnchor: [17, 17], html: `<div class="pin" style="background:${saved ? '#fbbf24' : col}"><span>${e}</span></div>` }); };
  function setCenter(c, r) {
    if (ring) map.removeLayer(ring);
    here.clearLayers();
    ring = L.circle([c.lat, c.lon], { radius: r, color: '#6366f1', weight: 2, fillOpacity: .06, dashArray: '6' }).addTo(map);
    let b = ring.getBounds();
    if (c.geo && /Polygon/.test(c.geo.type)) {
      const g = L.geoJSON(c.geo, { style: { color: '#e11d48', weight: 3, fillColor: '#e11d48', fillOpacity: .08 } }).addTo(here);
      b = b.extend(g.getBounds());
    }
    L.marker([c.lat, c.lon], { zIndexOffset: 1000, interactive: false, icon: L.divIcon({ className: '', iconSize: [18, 18], iconAnchor: [9, 9], html: `<div class="here"><i></i><b>${esc(c.label || 'Here')}</b></div>` }) }).addTo(here);
    map.fitBounds(b, { padding: [30, 30] });
  }
  function show(items, saved, onPick) {
    layer.clearLayers();
    items.forEach(p => {
      const m = L.marker([p.lat, p.lon], { icon: icon(p, saved.some(s => s.id === p.id)), title: p.name }).addTo(layer);
      m.bindTooltip(p.name); m.on('click', () => onPick(p));
    });
  }
  const focus = p => map.flyTo([p.lat, p.lon], Math.max(map.getZoom(), 16), { duration: .6 });
  function drawRoute(geo) {
    routeLayer.clearLayers();
    const l = L.geoJSON(geo, { style: { color: '#4f46e5', weight: 6, opacity: .9 } }).addTo(routeLayer);
    map.fitBounds(l.getBounds(), { padding: [50, 50] });
  }
  const clearRoute = () => routeLayer && routeLayer.clearLayers();
  const center = () => { const c = map.getCenter(); return { lat: +c.lat.toFixed(6), lon: +c.lng.toFixed(6) }; };
  const resize = () => map && [50, 300, 900].forEach(t => setTimeout(() => map.invalidateSize(), t));
  return { init, setCenter, show, focus, drawRoute, clearRoute, center, resize };
})();
