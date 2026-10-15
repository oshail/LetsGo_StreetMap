/* SCRIPT 3 — interface layer: validation, feedback, empty/error states, favourites, sharing */
(() => {
  const $ = s => document.querySelector(s);
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const store = { get(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { } } };
  const S = { c: null, cat: 'cafe', list: [], saved: store.get('wf_saved', []), view: 'nearby', routes: {} };
  const tone = { ok: 'bg-lime-400/15 text-emerald-700', err: 'bg-rose-100 text-rose-800', info: 'bg-sky-100 text-sky-800' };

  function say(el, msg, type = 'info') { el.className = 'text-sm rounded-lg px-3 py-2 ' + tone[type]; el.textContent = msg; el.classList.toggle('hidden', !msg); }
  function launch() { $('#landing').classList.add('hidden'); $('#app').classList.remove('hidden'); $('#app').classList.add('flex'); MapView.resize(); }

  function badge(p) {
    const o = p.open === true ? ['Open now', 'bg-emerald-100 text-emerald-800'] : p.open === false ? ['Closed', 'bg-rose-100 text-rose-800'] : ['Hours unknown', 'bg-stone-200 text-stone-600'];
    const w = { yes: ['♿ Accessible', 'bg-sky-100 text-sky-800'], limited: ['♿ Limited', 'bg-amber-100 text-amber-800'], no: ['♿ Not accessible', 'bg-stone-200 text-stone-600'] }[p.wheel];
    return `<span class="px-2 py-0.5 rounded-full text-xs ${o[1]}">${o[0]}</span>` + (w ? ` <span class="px-2 py-0.5 rounded-full text-xs ${w[1]}">${w[0]}</span>` : '');
  }
  function card(p) {
    const star = S.saved.some(s => s.id === p.id), r = S.routes[p.id];
    return `<div class="p-3.5 rounded-2xl bg-white border border-slate-200 shadow-sm hover:shadow-lg hover:border-indigo-300 transition" data-id="${p.id}">
      <div class="flex justify-between gap-2"><button data-act="go" class="text-left font-semibold">${API.CATS[p.cat][0]} ${esc(p.name)}</button><button data-act="save" aria-label="Save place" class="text-lg ${star ? 'text-amber-500' : 'text-stone-400'}">${star ? '★' : '☆'}</button></div>
      <p class="text-sm text-stone-500 mt-1">${p.dist != null ? `${p.dist} m · ${p.walk} min walk` : 'Search a place to see distance'}</p>
      <div class="mt-2">${badge(p)}</div>
      ${p.hours ? `<p class="text-xs text-stone-400 mt-1 truncate" title="${esc(p.hours)}">🕒 ${esc(p.hours)}</p>` : ''}
      <p class="text-sm text-emerald-700 mt-1 ${r ? '' : 'hidden'}">🚶 Route: ${r ? r.km + ' km · ' + r.min + ' min' : ''}</p></div>`;
  }
  function emptyBox(icon, title, text) { return `<div class="text-center py-10 px-4 text-stone-500"><div class="text-4xl">${icon}</div><p class="font-semibold text-stone-800 mt-2">${title}</p><p class="text-sm mt-1">${text}</p></div>`; }

  function render() {
    const box = $('#results');
    let items = S.view === 'saved' ? S.saved.map(p => ({ ...p, ...(S.c ? API.measure(p, S.c) : { dist: null }) })) : [...S.list];
    if (S.view === 'nearby') {
      if ($('#fOpen').checked) items = items.filter(p => p.open === true);
      if ($('#fWheel').checked) items = items.filter(p => p.wheel === 'yes');
    }
    items.sort($('#sort').value === 'name' ? (a, b) => a.name.localeCompare(b.name) : (a, b) => (a.dist ?? 1e9) - (b.dist ?? 1e9));
    MapView.show(items, S.saved, pick);
    $('#count').textContent = items.length;
    if (items.length) { box.innerHTML = items.map(card).join(''); return; }
    if (S.view === 'saved') box.innerHTML = emptyBox('⭐', 'No saved places yet', 'Tap the ☆ on any result to keep it here.');
    else if (!S.c) box.innerHTML = emptyBox('🧭', 'Where to?', 'Search for a place or tap “Use my location” to begin.');
    else {
      const f = $('#fOpen').checked || $('#fWheel').checked;
      box.innerHTML = emptyBox('🔍', `No ${API.CATS[S.cat][1].toLowerCase()} found`, f ? 'Your filters may be too strict – try turning them off.' : 'Try a larger radius or another category. You can also report a missing place below.');
    }
  }

  async function load() {
    if (!S.c) { render(); return; }
    const box = $('#results'), r = +$('#radius').value;
    box.innerHTML = '<div class="sk h-20 rounded-xl bg-stone-200"></div>'.repeat(3);
    say($('#status'), 'Searching OpenStreetMap…', 'info');
    try {
      S.list = await API.nearby(S.c, r, S.cat); S.routes = {}; MapView.clearRoute();
      say($('#status'), S.list.length ? `Found ${S.list.length} places within ${r} m.` : '', 'ok');
      render();
    } catch (e) {
      S.list = []; say($('#status'), e.message, 'err');
      box.innerHTML = emptyBox('⚠️', 'Couldn’t load places', e.message) + '<button id="retry" class="block mx-auto px-4 py-2 rounded-lg bg-indigo-600 text-white font-semibold">Try again</button>';
      $('#retry').onclick = load; $('#count').textContent = 0;
    }
  }
  function setCenter(c) { S.c = c; MapView.setCenter(c, +$('#radius').value); location.hash = `${c.lat.toFixed(5)},${c.lon.toFixed(5)},${S.cat},${$('#radius').value}`; return load(); }

  async function pick(p) {
    MapView.focus(p);
    if (!S.c || S.routes[p.id]) return;
    try { const r = await API.route(S.c, p); S.routes[p.id] = r; MapView.drawRoute(r.geo); render(); }
    catch (e) { say($('#status'), 'Route unavailable: ' + e.message, 'err'); }
  }
  function toggleSave(p) {
    S.saved = S.saved.some(s => s.id === p.id) ? S.saved.filter(s => s.id !== p.id) : [...S.saved, p];
    store.set('wf_saved', S.saved); $('#tabS').textContent = `★ Saved (${S.saved.length})`; render();
  }
  const find = id => S.list.find(p => p.id === id) || S.saved.find(p => p.id === id);

  // ---- search form validation
  let SUG = [];
  function showSuggest(g) {
    SUG = g; const b = $('#suggest');
    b.innerHTML = g.map((x, i) => `<button type="button" data-i="${i}" class="block w-full text-left px-4 py-2.5 hover:bg-indigo-50 border-b border-slate-100"><span class="font-semibold">${esc(x.name || x.display_name.split(',')[0])}</span> <span class="text-xs text-slate-500">${esc(x.address?.country || '')}</span><br><span class="text-xs text-slate-400">${esc(x.display_name.slice(0, 90))}</span></button>`).join('');
    b.classList.remove('hidden');
  }
  function choose(x) { $('#suggest').classList.add('hidden'); $('#place').value = x.display_name.split(',').slice(0, 2).join(',').trim(); return setCenter({ lat: +x.lat, lon: +x.lon, label: x.display_name.split(',')[0].trim(), geo: x.geojson }); }
  $('#suggest').onclick = e => { const b = e.target.closest('[data-i]'); if (b) choose(SUG[+b.dataset.i]); };
  $('#searchForm').addEventListener('submit', async e => {
    e.preventDefault();
    const v = $('#place').value.trim(), err = $('#placeErr');
    err.classList.add('hidden'); $('#suggest').classList.add('hidden');
    if (v.length < 3) { err.textContent = 'Please type at least 3 characters (a place, street or city).'; err.classList.remove('hidden'); return; }
    if (!/[\p{L}]/u.test(v)) { err.textContent = 'Include some letters – numbers alone can’t be located.'; err.classList.remove('hidden'); return; }
    say($('#status'), 'Locating “' + v + '”…', 'info');
    try {
      const g = await API.geocode(v);
      if (!g.length) { err.textContent = `We couldn’t find “${v}”. Check the spelling or add a city name.`; err.classList.remove('hidden'); say($('#status'), '', 'info'); return; }
      if (g.length > 1) { showSuggest(g); say($('#status'), 'Several matches worldwide – pick yours.', 'info'); return; }
      await choose(g[0]);
    } catch (x) { say($('#status'), x.message, 'err'); }
  });
  $('#locate').onclick = () => {
    if (!navigator.geolocation) return say($('#status'), 'Your browser doesn’t support location.', 'err');
    say($('#status'), 'Getting your location…', 'info');
    navigator.geolocation.getCurrentPosition(p => setCenter({ lat: p.coords.latitude, lon: p.coords.longitude, label: 'You are here' }),
      er => say($('#status'), er.code === 1 ? 'Location permission denied – search for a place instead.' : 'Couldn’t get your location.', 'err'), { timeout: 10000 });
  };

  // ---- chips, filters, tabs, results
  $('#chips').innerHTML = Object.entries(API.CATS).map(([k, v]) => `<button data-cat="${k}" class="chip px-3 py-1.5 rounded-full text-sm border-2">${v[0]} ${v[1]}</button>`).join('');
  const paintChips = () => document.querySelectorAll('.chip').forEach(b => b.className = 'chip shrink-0 px-3.5 py-2 rounded-full text-sm font-medium border ' + (b.dataset.cat === S.cat ? 'bg-indigo-600 text-white border-indigo-600 font-semibold shadow' : 'border-transparent bg-white/95 text-slate-700 shadow hover:bg-indigo-50'));
  $('#chips').onclick = e => { const b = e.target.closest('[data-cat]'); if (b) { S.cat = b.dataset.cat; S.view = 'nearby'; paintChips(); setTab(); if (S.c) setCenter(S.c); else render(); } };
  $('#radius').oninput = e => $('#rv').textContent = e.target.value;
  $('#radius').onchange = () => S.c && setCenter(S.c);
  ['#fOpen', '#fWheel', '#sort'].forEach(s => $(s).onchange = render);
  const setTab = () => { $('#tabN').className = 'px-3 py-1 rounded-full ' + (S.view === 'nearby' ? 'bg-indigo-100 text-indigo-700 font-semibold' : ''); $('#tabS').className = 'px-3 py-1 rounded-full ' + (S.view === 'saved' ? 'bg-indigo-100 text-indigo-700 font-semibold' : ''); };
  $('#tabN').onclick = () => { S.view = 'nearby'; setTab(); render(); };
  $('#tabS').onclick = () => { S.view = 'saved'; setTab(); render(); };
  $('#results').onclick = e => {
    const a = e.target.closest('[data-act]'), id = e.target.closest('[data-id]')?.dataset.id, p = id && find(id);
    if (a && p) a.dataset.act === 'save' ? toggleSave(p) : pick(p);
  };
  $('#share').onclick = async () => {
    if (!S.c) return say($('#status'), 'Search a place first, then share it.', 'err');
    try { await navigator.clipboard.writeText(location.href); say($('#status'), 'Link copied!', 'ok'); } catch { say($('#status'), 'Copy failed – copy the address bar link instead.', 'err'); }
  };

  // ---- report form (validation + feedback)
  const R = { rName: v => v.length < 3 ? 'Enter the place name (min 3 characters).' : '', rType: v => v ? '' : 'Choose a problem type.', rText: v => v.length < 10 ? 'Please add at least 10 characters of detail.' : '' };
  const rErr = (id, m) => { const el = document.querySelector(`.err[data-for=${id}]`); el.textContent = m; el.classList.toggle('hidden', !m); $('#' + id).classList.toggle('border-rose-500', !!m); };
  Object.keys(R).forEach(id => $('#' + id).addEventListener('input', () => { rErr(id, R[id]($('#' + id).value.trim())); $('#rCount').textContent = $('#rText').value.length + '/300'; }));
  $('#reportBtn').onclick = () => { const c = MapView.center(); $('#rLoc').textContent = `${c.lat}, ${c.lon}`; say($('#rFeedback'), '', 'info'); $('#modal').classList.remove('hidden'); };
  $('#rClose').onclick = () => $('#modal').classList.add('hidden');
  $('#reportForm').addEventListener('submit', async e => {
    e.preventDefault();
    const bad = Object.keys(R).map(id => { const m = R[id]($('#' + id).value.trim()); rErr(id, m); return m; }).filter(Boolean);
    if (bad.length) return say($('#rFeedback'), 'Please fix the highlighted fields.', 'err');
    const c = MapView.center(), text = `[Wayfinder] ${$('#rType').value}: ${$('#rName').value.trim()} – ${$('#rText').value.trim()}`;
    if ($('#rPreview').checked) return say($('#rFeedback'), '✅ Preview OK – nothing was sent. Untick “Preview only” to file it for real.', 'ok');
    say($('#rFeedback'), 'Sending to OpenStreetMap…', 'info');
    try { const id = await API.reportNote(c.lat, c.lon, text); say($('#rFeedback'), `🎉 Thank you! Note #${id} is now public on OpenStreetMap for mappers to fix.`, 'ok'); $('#reportForm').reset(); $('#rPreview').checked = true; }
    catch (x) { say($('#rFeedback'), 'Could not send: ' + x.message, 'err'); }
  });

  // ---- boot
  $('#launchTop').onclick = launch;
  const goCity = s => { const [n, la, lo] = s.split('|'); launch(); $('#place').value = n; $('#suggest').classList.add('hidden'); setCenter({ lat: +la, lon: +lo, label: n.split(',')[0] }); };
  document.querySelectorAll('[data-city]').forEach(b => b.onclick = () => goCity(b.dataset.city));
  $('#world').onchange = e => { if (e.target.value) goCity(e.target.value); };
  $('#fBtn').onclick = () => $('#filters').classList.toggle('hidden');
  document.querySelectorAll('[data-fill]').forEach(b => b.onclick = () => { $('#heroPlace').value = b.dataset.fill; });
  $('#heroForm').addEventListener('submit', e => { e.preventDefault(); const v = $('#heroPlace').value.trim(); launch(); $('#place').value = v; if (v) $('#searchForm').requestSubmit(); });
  document.querySelectorAll('[data-mood]').forEach(b => b.onclick = () => { S.cat = b.dataset.mood; S.view = 'nearby'; paintChips(); setTab(); launch(); if (S.c) setCenter(S.c); else { render(); say($('#status'), 'Great pick! Tell me where you are and I’ll find them.', 'info'); $('#place').focus(); } });
  $('#brand').onclick = e => { e.preventDefault(); $('#app').classList.add('hidden'); $('#app').classList.remove('flex'); $('#landing').classList.remove('hidden'); };
  try { MapView.init(); } catch (e) { $('#map').innerHTML = '<p style="padding:40px;text-align:center">The map library couldn’t load. Check your internet or ad-blocker, then refresh.</p>'; }
  paintChips(); setTab(); $('#tabS').textContent = `★ Saved (${S.saved.length})`; render();
  const h = location.hash.slice(1).split(',');
  if (h.length === 4 && !isNaN(h[0]) && !isNaN(h[1]) && API.CATS[h[2]]) { launch(); S.cat = h[2]; $('#radius').value = +h[3] || 1000; $('#rv').textContent = $('#radius').value; paintChips(); setCenter({ lat: +h[0], lon: +h[1], label: 'Shared spot' }); }
})();
