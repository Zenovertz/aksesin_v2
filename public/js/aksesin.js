(function () {
  'use strict';
  const D = globalThis.AksesinMalls;
  const I = globalThis.AksesinIndoor;
  const U = globalThis.AksesinUtils;
  const photos = globalThis.AksesinFacilityPhoto;
  const $ = id => document.getElementById(id);
  const icon = name => `<svg class="icon" aria-hidden="true"><use href="#i-${name}"/></svg>`;
  const escape = text => String(text ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const facilityIcons = { toilet: 'toilet', lift: 'lift', entrance: 'door', parking: 'parking', wheelchair: 'wheelchair' };
  const blank = (mallId = 'delipark') => ({ mallId, floorId: null, originLabel: null, facility: null });
  let context = blank();
  let viewedFloor = null;
  let positionAt = null;
  let aiEnabled = false;
  let chatVersion = 0, chatController = null, chatBusy = false;
  let locationVersion = 0, locationTimer = null, locationPending = false;
  let deviceLocation = null;
  const areaMap = globalThis.AksesinCesiumMap.create({ onLocate: locate });
  const indoorNav = globalThis.AksesinNavigator.create({ container: $('indoorNavigator'), onMessage: text => addMessage(text) });

  function link(label, href) {
    const a = document.createElement('a'); a.textContent = label; a.href = href;
    if (!href.startsWith('tel:')) { a.target = '_blank'; a.rel = 'noopener noreferrer'; }
    return a;
  }
  function button(label, handler) {
    const b = document.createElement('button'); b.type = 'button'; b.textContent = label;
    b.addEventListener('click', () => { cancelChat(); cancelPendingLocation(); handler(); });
    return b;
  }
  function addMessage(message, role = 'assistant', actions = []) {
    const article = document.createElement('article'); article.className = `chatMessage ${role}`;
    const label = document.createElement('span'); label.className = 'messageLabel'; label.textContent = role === 'user' ? 'Kamu' : 'Aksesin';
    const p = document.createElement('p'); p.textContent = message; article.append(label, p);
    if (actions.length) { const row = document.createElement('div'); row.className = 'messageActions'; row.append(...actions); article.append(row); }
    $('chatLog').append(article);
    while ($('chatLog').children.length > 50) $('chatLog').firstElementChild.remove();
    $('chatLog').scrollTop = $('chatLog').scrollHeight;
    return article;
  }
  function greeting() {
    addMessage('Mau dari mana ke mana? Coba “dari pintu masuk ke toilet difabel” atau “dari concierge ke kafe L1”.\n\nAku akan menghitung rute rekomendasi, terpendek, dan tercepat, lalu menampilkan garis jalur dan panduan belok.\n\nNavigasi saat ini memakai denah latihan buatan yang jelas berlabel demo. Info dan foto mall asli tersedia pada bagian Info fasilitas.');
  }
  function cancelChat() {
    chatVersion++; chatController?.abort(); chatController = null; chatBusy = false;
    $('sendChat').disabled = false; $('chatLog').removeAttribute('aria-busy');
  }
  function cancelPendingLocation() {
    if (!locationPending) return;
    locationVersion++; clearTimeout(locationTimer); locationPending = false;
    $('locationButton').disabled = false; $('clearLocationButton').hidden = !deviceLocation;
    $('locationStatus').textContent = 'Pencarian area dibatalkan karena pilihan diperbarui.';
  }
  function resetJourney() {
    $('journeyPanel').hidden = true; $('journeySteps').replaceChildren();
    $('journeyPhoto').replaceChildren();
  }
  function currentMall() { return D.getMall(context.mallId); }
  function floorLabel(id = context.floorId) { return I.getFloor(context.mallId, id)?.label || ''; }
  function positionLabel() {
    return [context.originLabel, floorLabel()].filter(Boolean).join(' · ') || 'Belum ditentukan';
  }
  function renderPosition() {
    $('floorSelect').value = context.floorId || ''; $('originInput').value = context.originLabel || '';
    $('positionStatus').textContent = positionAt
      ? `Posisi yang kamu sebutkan: ${positionLabel()}. Perbarui jika sudah berpindah; ini bukan posisi GPS.`
      : 'Posisi dalam gedung belum ditentukan.';
  }
  function expirePosition() {
    if (!positionAt || Date.now() - positionAt <= 15 * 60 * 1000) return;
    context.floorId = null; context.originLabel = null; positionAt = null;
    resetJourney(); renderPosition();
    $('positionStatus').textContent = 'Posisi sebelumnya sudah lebih dari 15 menit. Konfirmasikan posisi sekarang.';
  }
  function selectMall(id, announce = true) {
    const mall = D.getMall(id); if (!mall) return;
    cancelChat(); cancelPendingLocation();
    if (context.mallId !== id) { context = blank(id); viewedFloor = null; positionAt = null; resetJourney(); }
    $('selectedMallName').textContent = mall.name;
    document.querySelectorAll('[data-select-mall]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.selectMall === id)));
    $('floorSelect').replaceChildren(new Option('Belum tahu lantainya', ''), ...I.getFloors(id).map(floor => new Option(floor.label, floor.id)));
    renderPosition(); renderDirectory();
    areaMap.setMall(mall); indoorNav.setMall(mall);
    if (announce) addMessage(`${mall.name} dipilih untuk informasi fasilitas. Navigasi yang bisa dicoba menggunakan denah latihan terpisah. Pilih titik awal dan tujuan pada denah.`, 'assistant', [button('Pilih titik awal', () => $('navStart').focus())]);
  }
  function renderDirectory() {
    const mall = currentMall();
    $('directoryTitle').textContent = `Direktori resmi ${mall.shortName}`;
    $('directoryLink').href = mall.directoryUrl;
    $('floorTabs').replaceChildren(...I.getFloors(mall.id).map(floor => {
      const b = document.createElement('button'); b.type = 'button'; b.dataset.floor = floor.id;
      b.textContent = floor.label; b.setAttribute('aria-pressed', String(viewedFloor === floor.id));
      b.addEventListener('click', () => { viewedFloor = floor.id; renderDirectory(); }); return b;
    }));
    const area = $('floorPlanArea'); area.replaceChildren();
    const plan = I.FLOORPLANS?.[mall.id]?.[viewedFloor];
    if (plan?.imageUrl && plan.inspected === true) {
      const figure = document.createElement('figure');
      const img = document.createElement('img'); img.alt = `Denah resmi ${floorLabel(viewedFloor)} — ${mall.name}`;
      img.className = 'officialFloorPlan'; img.loading = 'lazy'; img.src = plan.imageUrl;
      const caption = document.createElement('figcaption'); caption.textContent = 'Denah dari pengelola. Tidak ada penanda posisi otomatis atau rute kursi roda terverifikasi.';
      figure.append(img, caption, link('Buka sumber denah ↗', plan.sourceUrl || mall.directoryUrl));
      img.addEventListener('error', () => { caption.textContent = 'Gambar denah belum dapat dimuat. Buka direktori resmi melalui tautan di atas.'; img.hidden = true; });
      area.append(figure); return;
    }
    const visual = document.createElement('span'); visual.className = 'directoryEmptyIcon'; visual.innerHTML = icon('door');
    const title = document.createElement('h4'); title.textContent = viewedFloor ? `${floorLabel(viewedFloor)} · ${mall.shortName}` : 'Kenali lantai tempatmu berada';
    const p = document.createElement('p');
    p.textContent = mall.id === 'delipark'
      ? 'Pengelola menyediakan direktori dengan pilihan lantai. Buka direktori resmi untuk melihat denah; titik fasilitas dan jalur kursi roda belum dipetakan di aplikasi ini.'
      : 'Informasi fasilitas Sun Plaza tersedia dari pengelola. Denah koridor yang dapat digunakan untuk navigasi belum tersedia dalam data aplikasi.';
    area.append(visual, title, p, link(mall.id === 'delipark' ? 'Lihat denah pada situs DeliPark ↗' : 'Lihat fasilitas pada situs Sun Plaza ↗', mall.directoryUrl));
  }
  function savePosition(announce = true) {
    cancelChat(); cancelPendingLocation(); resetJourney();
    const floor = I.getFloor(context.mallId, $('floorSelect').value);
    const origin = $('originInput').value.trim().replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, 120);
    if (!floor && !origin) { $('positionStatus').textContent = 'Pilih lantai atau tulis penanda terdekat terlebih dahulu.'; $('originInput').focus(); return; }
    context.floorId = floor?.id || null; context.originLabel = origin || null; positionAt = Date.now();
    renderPosition();
    if (announce) addMessage(`Posisi awal dicatat dari informasi kamu: ${positionLabel()}, ${currentMall().name}.\n\nMau mencari fasilitas apa?`, 'assistant', facilityActions());
  }
  function invalidatePosition() {
    cancelChat(); cancelPendingLocation(); resetJourney(); context.floorId = null; context.originLabel = null; positionAt = null;
    $('positionStatus').textContent = 'Posisi belum dikonfirmasi. Tekan Pakai posisi ini setelah selesai mengisi.';
  }
  function facilityActions() {
    return ['toilet', 'lift', 'wheelchair'].map(id => button(currentMall().facilities.find(f => f.id === id).label, () => showFacility(id)));
  }
  function facilityLocation(item) {
    const translations = { 'All Toilet': 'Area toilet (pintu dan lantai spesifik belum dirinci)', 'All Areas': 'Area mall (titik lift belum dirinci)', 'All Car Parks': 'Area parkir', 'UG & L1': 'UG dan L1', 'GF (Zone C) Floor': 'GF, Zone C' };
    return translations[item.location] || item.location || 'Posisi belum terkonfirmasi';
  }
  function showFacility(id, withMessage = true) {
    cancelChat(); cancelPendingLocation(); expirePosition(); resetJourney();
    const mall = currentMall(); const item = mall.facilities.find(f => f.id === id); if (!item) return;
    context.facility = id;
    const place = facilityLocation(item);
    $('journeyPanel').hidden = false; $('journeyTitle').textContent = `${item.label} · ${mall.shortName}`;
    $('journeyOrigin').textContent = positionLabel(); $('journeyDestination').textContent = place;
    $('journeyNote').textContent = item.detail;
    if (id === 'wheelchair') $('journeyPhoto').append(photos.create(item, mall));
    $('journeySteps').replaceChildren();
    $('journeySource').href = item.sourceUrl;
    $('mallReference').open = true;
    if (withMessage) {
      const message = addMessage(`Info resmi ${mall.name}: ${item.label}\nLokasi tercantum: ${place}.\n\n${item.detail}\n\nFoto dan lokasi ini adalah referensi mall asli; rute pada denah latihan terpisah.`, 'assistant', [link('Sumber resmi ↗', item.sourceUrl), button('Coba tujuan di demo', () => indoorNav.chooseFacility(id))]);
      if (id === 'wheelchair') message.append(photos.create(item, mall));
      $('chatLog').scrollTop = $('chatLog').scrollHeight;
    }
  }
  function validIntent(value) {
    return value && ['indoor', 'position', 'help', 'unknown'].includes(value.intent)
      && [null, 'delipark', 'sun-plaza'].includes(value.mallId)
      && (value.floorId === null || typeof value.floorId === 'string' && value.floorId.length <= 40)
      && (value.originLabel === null || typeof value.originLabel === 'string' && value.originLabel.length <= 120)
      && [null, 'toilet', 'lift', 'entrance', 'parking', 'wheelchair'].includes(value.facility);
  }
  function applyIntent(intent) {
    if (!validIntent(intent) || intent.intent === 'unknown') {
      addMessage('Aku belum mengenali permintaan itu. Coba “dari pintu masuk ke toilet difabel” atau pilih titik awal dan tujuan pada denah latihan. Info fasilitas mall asli tersedia di bawahnya.'); return;
    }
    if (intent.intent === 'help') { greeting(); return; }
    if (intent.mallId && intent.mallId !== context.mallId) selectMall(intent.mallId, false);
    const floor = I.getFloor(context.mallId, intent.floorId);
    if (intent.floorId && !floor) { addMessage('Lantai itu belum ada pada direktori yang tersedia. Pilih lantai dari daftar, atau tulis penanda terdekat sebagai posisi awal.'); return; }
    if (floor || intent.originLabel || intent.intent === 'position') {
      context.floorId = floor?.id || null;
      context.originLabel = intent.originLabel?.trim() || null;
      positionAt = context.floorId || context.originLabel ? Date.now() : null;
      resetJourney(); renderPosition();
    }
    if (intent.facility) {
      const label = currentMall().facilities.find(item => item.id === intent.facility)?.label;
      if (intent.originLabel && label) indoorNav.handleMessage(`dari ${intent.originLabel} ke ${label}`);
      else indoorNav.chooseFacility(intent.facility);
    }
    else if (intent.intent === 'position') {
      resetJourney();
      addMessage(positionAt ? `Posisi yang kamu sebutkan: ${positionLabel()}, ${currentMall().name}. Kamu ingin mencari fasilitas apa?` : `${currentMall().name} dipilih. Kamu di lantai berapa, dan dekat toko atau penanda apa?`, 'assistant', facilityActions());
    } else addMessage('Mau mencari toilet difabel, lift, parkir, atau peminjaman kursi roda?', 'assistant', facilityActions());
  }
  async function sendMessage(text) {
    text = text.trim(); if (!text || text.length > 600 || chatBusy) return;
    cancelPendingLocation(); expirePosition(); addMessage(text, 'user'); $('chatInput').value = '';
    const localIntent = I.parseMessage(text, context); let intent = localIntent;
    if (localIntent.mallId && localIntent.mallId !== context.mallId) selectMall(localIntent.mallId, false);
    // The navigation component resolves only named points in its own plan.
    // Browser GPS and the real mall reference form never become indoor coordinates.
    if (indoorNav.handleMessage(text)) return;
    const version = ++chatVersion;
    if (aiEnabled && localIntent.intent === 'unknown') {
      chatBusy = true; $('sendChat').disabled = true; $('chatLog').setAttribute('aria-busy', 'true');
      const controller = new AbortController(); chatController = controller;
      const timer = setTimeout(() => controller.abort(), 16000);
      try {
        const response = await fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: text, context }), signal: controller.signal });
        if (!response.ok) throw new Error('chat');
        const result = await response.json(); if (version !== chatVersion) return;
        if (result.source === 'openai' && validIntent(result)) intent = result;
        else $('chatServiceNote').textContent = 'AI belum tersedia. Chat dasar dan pilihan fasilitas tetap bisa dipakai.';
      } catch {
        if (version !== chatVersion) return;
        $('chatServiceNote').textContent = 'Sambungan AI belum tersedia. Chat dasar dan pilihan fasilitas tetap bisa dipakai.';
      } finally {
        clearTimeout(timer);
        if (version === chatVersion) { chatBusy = false; chatController = null; $('sendChat').disabled = false; $('chatLog').removeAttribute('aria-busy'); }
      }
    }
    if (version === chatVersion) applyIntent(intent);
  }
  function clearLocation() {
    locationVersion++; clearTimeout(locationTimer); locationPending = false; deviceLocation = null;
    areaMap.clearLocation();
    $('locationButton').disabled = false; $('clearLocationButton').hidden = true;
    $('locationStatus').textContent = 'Lokasi perangkat belum digunakan.'; $('gpsSuggestion').replaceChildren();
  }
  function locate() {
    cancelChat(); clearLocation(); $('mallReference').open = true; $('gpsDetails').open = true;
    if (!navigator.geolocation || !globalThis.isSecureContext) { $('locationStatus').textContent = 'Lokasi perangkat memerlukan HTTPS atau localhost. Kamu tetap bisa memilih mall dan posisi awal secara manual.'; return; }
    const version = ++locationVersion; locationPending = true;
    $('locationButton').disabled = true; $('clearLocationButton').hidden = false;
    $('locationStatus').textContent = 'Meminta lokasi perangkat sekali untuk memperkirakan area mall…';
    function fail(message) {
      if (version !== locationVersion) return;
      locationVersion++; clearTimeout(locationTimer); locationPending = false; $('locationButton').disabled = false;
      $('clearLocationButton').hidden = true; $('locationStatus').textContent = message;
    }
    locationTimer = setTimeout(() => fail('Lokasi belum diperoleh. Pilih mall secara manual dan isi posisi awal.'), 18000);
    navigator.geolocation.getCurrentPosition(position => {
      if (version !== locationVersion) return;
      const point = { lat: position.coords.latitude, lon: position.coords.longitude, accuracy: position.coords.accuracy };
      if (!U.inMedan(point)) { fail('Lokasi perangkat tidak menunjukkan area Medan. Kamu tetap bisa memilih mall secara manual.'); return; }
      if (!Number.isFinite(point.accuracy) || point.accuracy <= 0 || point.accuracy > 150) { fail('Perkiraan lokasi terlalu luas untuk membantu memilih mall. Pilih mall secara manual; posisi dalam gedung tidak diubah.'); return; }
      clearTimeout(locationTimer); locationPending = false; $('locationButton').disabled = false; deviceLocation = point;
      areaMap.setLocation(point);
      const closest = D.MALLS.map(mall => ({ mall, distance: U.distanceMeters(point, mall) })).sort((a, b) => a.distance - b.distance)[0];
      $('locationStatus').textContent = `Perkiraan akurasi ±${Math.ceil(point.accuracy)} m. Lantai dan posisi dalam gedung tidak diketahui. Lokasi diambil sekali.`;
      const p = document.createElement('p');
      if (closest.distance > 350 + point.accuracy) { p.textContent = 'Lokasi ini belum cukup dekat untuk menyarankan salah satu mall. Pilih mall tempatmu berada secara manual.'; $('gpsSuggestion').append(p); return; }
      p.textContent = `Perangkat tampak berada dekat area ${closest.mall.name}. Konfirmasikan mall tempatmu berada; ini belum membuktikan kamu berada di dalam bangunannya.`;
      $('gpsSuggestion').append(p, button(`Saya berada di ${closest.mall.shortName}`, () => { selectMall(closest.mall.id); $('gpsSuggestion').replaceChildren(); }));
    }, error => fail(({ 1: 'Izin lokasi ditolak. Pilih mall dan isi posisi di dalam gedung secara manual.', 2: 'Lokasi perangkat belum ditemukan. Pilih mall secara manual.', 3: 'Pencarian lokasi melewati batas waktu. Coba lagi atau pilih mall secara manual.' })[error.code] || 'Lokasi perangkat belum tersedia. Pilih mall secara manual.'), { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 });
  }
  function renderMalls() {
    $('mallCards').innerHTML = D.MALLS.map((mall, index) => `<article class="mallCard" id="mall-${mall.id}"><div class="mallCover ${mall.id}" aria-label="Ilustrasi arsitektur, bukan foto ${escape(mall.name)}"><span class="mallTree" aria-hidden="true"></span><span class="mallCoverLabel">0${index + 1} / MEDAN</span><span class="coverDisclosure">Ilustrasi</span></div><div class="mallBody"><span class="eyebrow">FASILITAS DI DALAM MALL</span><h3>${escape(mall.name)}</h3><p class="address">${escape(mall.address)}</p><div class="mallActions"><button class="button primary" type="button" data-card-mall="${mall.id}">Saya di mall ini ${icon('arrow')}</button><button class="button secondary" type="button" data-card-toilet="${mall.id}">${icon('toilet')}Info toilet</button></div><div class="facilityGrid">${mall.facilities.map(item => `<div class="facilityItem" data-facility-item="${mall.id}-${item.id}"><span class="facilityIcon">${icon(facilityIcons[item.id])}</span><div class="facilityCopy"><strong>${escape(item.label)}</strong><span class="statusPill ${item.status}">${item.status === 'published' ? 'Tercantum resmi' : 'Belum terkonfirmasi'}</span><p>${escape(item.detail)}</p><p class="facilityLocation">${escape(facilityLocation(item))}</p><a href="${escape(item.sourceUrl)}" target="_blank" rel="noopener noreferrer">Sumber fasilitas ↗</a></div></div>`).join('')}</div><div class="mallLinks"><a href="${escape(mall.directoryUrl)}" target="_blank" rel="noopener noreferrer">Direktori resmi ↗</a><a href="${escape(mall.phoneHref || mall.website)}"${mall.phoneHref ? '' : ' target="_blank" rel="noopener noreferrer"'}>${mall.phone ? `Telepon ${escape(mall.phone)}` : 'Situs pengelola ↗'}</a></div></div></article>`).join('');
    D.MALLS.forEach(mall => {
      const item = mall.facilities.find(f => f.id === 'wheelchair');
      document.querySelector(`[data-facility-item="${mall.id}-wheelchair"] .facilityCopy`).append(photos.create(item, mall));
    });
    document.querySelectorAll('[data-card-mall]').forEach(b => b.addEventListener('click', () => { selectMall(b.dataset.cardMall); $('planner').scrollIntoView({ block: 'start' }); }));
    document.querySelectorAll('[data-card-toilet]').forEach(b => b.addEventListener('click', () => { selectMall(b.dataset.cardToilet, false); showFacility('toilet'); $('planner').scrollIntoView({ block: 'start' }); }));
  }
  async function checkServices() {
    if (!['http:', 'https:'].includes(location.protocol)) return;
    try {
      const response = await fetch('/api/health', { signal: AbortSignal.timeout(4000) }); if (!response.ok) return;
      const health = await response.json(); aiEnabled = health.aiEnabled === true && health.mode === 'indoor';
      $('assistantMode').textContent = aiEnabled ? 'AI diaktifkan' : 'Asisten lokal';
      $('chatServiceNote').textContent = aiEnabled ? 'AI membantu memahami pesan yang belum dikenali. Pesan serta posisi yang kamu ketik dikirim ke OpenAI; koordinat GPS tidak ikut dikirim oleh aplikasi.' : 'Rute denah latihan dihitung di perangkat tanpa API key. Foto dan informasi mall mengikuti sumber resmi.';
    } catch { /* Local indoor information remains available. */ }
  }
  $('chatForm').addEventListener('submit', event => { event.preventDefault(); sendMessage($('chatInput').value); });
  $('chatInput').addEventListener('keydown', event => { if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) { event.preventDefault(); sendMessage($('chatInput').value); } });
  document.querySelectorAll('[data-prompt]').forEach(b => b.addEventListener('click', () => sendMessage(b.dataset.prompt)));
  document.querySelectorAll('[data-select-mall]').forEach(b => b.addEventListener('click', () => selectMall(b.dataset.selectMall)));
  document.querySelectorAll('[data-facility]').forEach(b => b.addEventListener('click', () => showFacility(b.dataset.facility)));
  $('positionForm').addEventListener('submit', event => { event.preventDefault(); savePosition(); });
  $('floorSelect').addEventListener('change', invalidatePosition); $('originInput').addEventListener('input', invalidatePosition);
  $('locationButton').addEventListener('click', locate); $('clearLocationButton').addEventListener('click', () => { cancelChat(); clearLocation(); });
  $('demoFacilityButton').addEventListener('click', () => { cancelChat(); cancelPendingLocation(); indoorNav.chooseFacility(context.facility); $('indoorNavigator').scrollIntoView({ block: 'start' }); });
  for (const event of ['click', 'change', 'submit']) $('indoorNavigator').addEventListener(event, () => { cancelChat(); cancelPendingLocation(); });
  $('clearChatButton').addEventListener('click', () => { cancelChat(); clearLocation(); indoorNav.clear(); context = blank(context.mallId); positionAt = null; resetJourney(); renderPosition(); $('chatLog').replaceChildren(); greeting(); $('chatInput').focus(); });
  window.addEventListener('pagehide', () => { cancelChat(); clearLocation(); indoorNav.clear(); context = blank(context.mallId); positionAt = null; resetJourney(); renderPosition(); });
  renderMalls(); selectMall('delipark', false); greeting(); checkServices();
})();
