(function (root) {
  'use strict';

  const PROFILES = ['recommended', 'shortest', 'fastest'];
  const PROFILE_LABELS = { recommended: 'Rekomendasi', shortest: 'Terpendek', fastest: 'Tercepat' };
  const PROFILE_REASONS = {
    recommended: 'Mengutamakan koridor lebar, landai, dan permukaan rata.',
    shortest: 'Jarak paling pendek yang memenuhi batas akses kursi roda.',
    fastest: 'Estimasi waktu bergerak, termasuk waktu tunggu lift.'
  };
  const SVG_NS = 'http://www.w3.org/2000/svg';
  const normalize = text => String(text || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[.,!?]/g, ' ').replace(/\s+/g, ' ').trim();
  const minutes = seconds => seconds < 60 ? `${Math.ceil(seconds)} dtk` : `${Math.ceil(seconds / 60)} menit`;
  const distance = value => `${Math.round(value)} m`;

  function create({ container, onMessage = () => {} } = {}) {
    const plan = root.AksesinDemoPlan;
    const engine = root.AksesinRoutes;
    if (!container || !plan || !engine) return null;
    const nodes = new Map(plan.nodes.map(node => [node.id, node]));
    let mallId = null;
    let profile = 'recommended';
    let routes = {};
    let stepIndex = 0;
    let floorId = plan.floors[0].id;
    let selectedGoal = 'nearest-toilet';
    const blocked = new Set();
    let speaking = false;
    let voiceGeneration = 0;
    container.classList.add('indoorNav');
    container.innerHTML = `
      <div class="navHeading"><div><span class="demoBadge">DEMO · BUKAN DENAH MALL</span><h3>Temukan jalan di dalam ruangan</h3></div></div>
      <p class="navDisclosure" id="navDemoDisclosure">Denah latihan buatan untuk mencoba rute kursi roda. Jangan gunakan petunjuk ini untuk berjalan di mall sebenarnya.</p>
      <form class="navForm">
        <label for="navStart">Titik awal<select id="navStart" required><option value="">Pilih posisi pada denah latihan</option></select></label>
        <label for="navDestination">Tujuan<select id="navDestination"><option value="nearest-toilet">Toilet difabel terdekat</option></select></label>
        <button class="button primary" id="navFindRoute" type="submit">Cari rute dalam ruangan</button>
      </form>
      <p class="navError" id="navRouteError" role="alert" hidden></p>
      <div class="routeChoices" aria-label="Pilihan rute" hidden></div>
      <div class="navFloorTabs" aria-label="Lantai denah latihan"></div>
      <div class="indoorCanvas"><svg id="indoorPlan" role="group" aria-labelledby="navPlanTitle navPlanDescription"></svg></div>
      <div class="navLegend"><span><i class="planStart"></i>Awal</span><span><i class="planEnd"></i>Tujuan</span><span><i class="planCurrent"></i>Posisi simulasi</span><span>Garis putus-putus: tangga / jalur terhalang</span></div>
      <p class="navEmpty">Pilih titik awal dan tujuan. Aplikasi akan membandingkan jalur, lalu menampilkan langkahnya pada denah latihan.</p>
      <section class="navRouteSummary" aria-label="Hasil rute simulasi" hidden>
        <h4 id="navRouteTitle"></h4><p id="navRouteStats"></p><p id="navRouteReason"></p>
        <div class="navGuidance" role="status" aria-live="polite" aria-atomic="true"><span class="navProgress" id="navProgress"></span><strong id="navInstruction"></strong><p id="navCurrentLocation"></p></div>
        <div class="navStepActions"><button type="button" class="button" id="navPrevious">Langkah sebelumnya</button><button type="button" class="button primary" id="navNext">Simulasikan langkah berikutnya</button><button type="button" class="button" id="navVoice">Dengarkan langkah</button></div>
        <p class="navVoiceStatus" id="navVoiceStatus" role="status"></p>
        <div class="navObstacle"><button type="button" class="button" id="navBlockPath">Simulasikan jalur terhalang</button><p id="navObstacleNote">Coba tutup jalur berikutnya untuk mencari alternatif dari posisi simulasi.</p></div>
        <details class="navStepsDetails"><summary>Semua langkah perjalanan</summary><ol class="navStepsList"></ol></details>
      </section>`;

    const $ = selector => container.querySelector(selector);
    const startSelect = $('#navStart');
    const destinationSelect = $('#navDestination');
    const svg = $('#indoorPlan');
    const currentRoute = () => routes[profile] || null;
    const emit = text => onMessage(`Demo navigasi: ${text}`);
    function selectStart(id) {
      // A route can reach an unnamed junction that is not in the usual place list.
      // Keep that position selectable when recalculating from the current step.
      for (const option of startSelect.querySelectorAll('[data-current-junction]')) option.remove();
      const node = nodes.get(id);
      if (node?.type === 'junction') {
        const option = document.createElement('option');
        option.value = id; option.textContent = `Posisi simulasi: ${node.label}`;
        option.dataset.currentJunction = 'true'; startSelect.append(option);
      }
      startSelect.value = node ? id : '';
    }
    function nodeAtProgress() {
      const route = currentRoute();
      if (!route || !['ok', 'same-place'].includes(route.status)) return nodes.get(startSelect.value) || null;
      if (!route.steps.length) return nodes.get(route.nodes[0]?.id || route.nodes[0]) || nodes.get(startSelect.value) || null;
      return nodes.get(stepIndex === 0 ? route.steps[0].fromId : route.steps[stepIndex - 1].toId) || null;
    }
    function cancelVoice() {
      voiceGeneration += 1;
      if (speaking && root.speechSynthesis) root.speechSynthesis.cancel();
      speaking = false;
      $('#navVoiceStatus').textContent = '';
      $('#navVoice').textContent = 'Dengarkan langkah';
      $('#navVoice').setAttribute('aria-pressed', 'false');
    }
    function resetRoute() {
      cancelVoice(); routes = {}; stepIndex = 0;
      $('.navRouteSummary').hidden = true;
      $('.routeChoices').hidden = true;
      $('.navEmpty').hidden = false;
      $('#navRouteError').hidden = true;
      drawPlan();
    }
    function announceError(message) {
      $('#navRouteError').textContent = message;
      $('#navRouteError').hidden = false;
    }
    function clear() {
      blocked.clear(); profile = 'recommended'; selectStart(''); selectedGoal = 'nearest-toilet';
      destinationSelect.value = selectedGoal; floorId = plan.floors[0].id;
      resetRoute(); renderFloorTabs();
    }
    function optionsFor(select) {
      for (const floor of plan.floors) {
        const group = document.createElement('optgroup'); group.label = `Lantai ${floor.label}`;
        for (const node of plan.nodes.filter(item => item.floorId === floor.id && item.type !== 'junction')) {
          const option = document.createElement('option'); option.value = node.id; option.textContent = node.label;
          group.append(option);
        }
        select.append(group);
      }
    }
    optionsFor(startSelect); optionsFor(destinationSelect);

    function computeRoutes(fromId, goal) {
      const result = {};
      for (const routeProfile of PROFILES) {
        const goals = goal === 'nearest-toilet' ? plan.nodes.filter(node => node.type === 'toilet').map(node => node.id) : [goal];
        const candidates = goals.map(toId => engine.planRoute(plan, { fromId, toId, profile: routeProfile, blockedEdgeIds: [...blocked] }));
        const reachable = candidates.filter(route => route.status === 'ok' || route.status === 'same-place');
        reachable.sort((a, b) => a.cost - b.cost || a.distanceM - b.distanceM);
        result[routeProfile] = reachable[0] || candidates[0];
      }
      return result;
    }
    function findRoute({ fromId = startSelect.value, goal = destinationSelect.value, announce = true } = {}) {
      cancelVoice();
      if (!nodes.has(fromId)) { resetRoute(); announceError('Pilih titik awal pada denah latihan terlebih dahulu.'); startSelect.focus(); return false; }
      if (goal !== 'nearest-toilet' && !nodes.has(goal)) { resetRoute(); announceError('Pilih tujuan yang ada pada denah latihan.'); return false; }
      selectStart(fromId); selectedGoal = goal; destinationSelect.value = goal;
      routes = computeRoutes(fromId, goal); stepIndex = 0;
      floorId = nodes.get(fromId).floorId;
      renderRoute();
      const route = currentRoute();
      if (announce && route && ['ok', 'same-place'].includes(route.status)) {
        const finalId = route.steps.at(-1)?.toId || fromId;
        emit(`${nodes.get(fromId).label} → ${nodes.get(finalId).label}. Rute ${PROFILE_LABELS[profile].toLowerCase()}: ${distance(route.distanceM)}, sekitar ${minutes(route.durationSeconds)}. Ikuti garis pada denah latihan dan tekan “Simulasikan langkah berikutnya” untuk mencoba panduannya. Ini bukan denah mall sebenarnya.`);
      }
      return Boolean(route && ['ok', 'same-place'].includes(route.status));
    }

    function renderFloorTabs() {
      const host = $('.navFloorTabs'); host.replaceChildren();
      for (const floor of plan.floors) {
        const button = document.createElement('button'); button.type = 'button'; button.className = 'button';
        button.textContent = floor.label; button.setAttribute('aria-pressed', String(floor.id === floorId));
        button.addEventListener('click', () => { floorId = floor.id; renderFloorTabs(); drawPlan(); });
        host.append(button);
      }
    }
    function svgNode(tag, attributes = {}, content) {
      const node = document.createElementNS(SVG_NS, tag);
      for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, String(value));
      if (content !== undefined) node.textContent = content;
      return node;
    }
    function drawPlan() {
      svg.replaceChildren(); svg.setAttribute('viewBox', plan.viewBox);
      svg.append(svgNode('title', { id: 'navPlanTitle' }, `Denah latihan, lantai ${plan.floors.find(floor => floor.id === floorId)?.label || floorId}`));
      svg.append(svgNode('desc', { id: 'navPlanDescription' }, 'Denah buatan, bukan mall sebenarnya. Klik titik bernama untuk memilih awal perjalanan. Rute simulasi ditampilkan dengan garis hijau; semua petunjuk juga tersedia sebagai teks.'));
      const floorNodes = plan.nodes.filter(node => node.floorId === floorId);
      for (const node of floorNodes.filter(node => node.type !== 'junction')) {
        const room = svgNode('g', { class: 'planRoom' });
        room.append(svgNode('rect', { x: node.x - 57, y: node.y - 32, width: 114, height: 64, rx: 10 }));
        svg.append(room);
      }
      for (const edge of plan.edges) {
        const from = nodes.get(edge.from); const to = nodes.get(edge.to);
        if (!from || !to || from.floorId !== floorId || to.floorId !== floorId) continue;
        const className = blocked.has(edge.id) || edge.open === false ? 'planBlocked' : edge.kind === 'stairs' ? 'planStairs' : 'planCorridor';
        svg.append(svgNode('line', { class: className, x1: from.x, y1: from.y, x2: to.x, y2: to.y }));
      }
      const route = currentRoute();
      if (route?.status === 'ok') {
        for (const [index, step] of route.steps.entries()) {
          const from = nodes.get(step.fromId); const to = nodes.get(step.toId);
          if (from?.floorId !== floorId || to?.floorId !== floorId) continue;
          svg.append(svgNode('polyline', { class: `planRoute${index < stepIndex ? ' isComplete' : ''}`, points: `${from.x},${from.y} ${to.x},${to.y}` }));
        }
      }
      for (const node of floorNodes) {
        if (node.type === 'junction') continue;
        const group = svgNode('g', { class: `planNode${node.type === 'lift' ? ' planLift' : ''}`, role: 'button', tabindex: '0', 'aria-label': `Pilih ${node.label} sebagai titik awal simulasi` });
        group.append(svgNode('circle', { cx: node.x, cy: node.y, r: 12 }));
        const labelY = node.y > 410 ? node.y - 23 : node.y + 30;
        group.append(svgNode('text', { x: node.x, y: labelY, 'text-anchor': 'middle' }, node.label));
        const pick = () => { selectStart(node.id); resetRoute(); };
        group.addEventListener('click', pick);
        group.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); pick(); } });
        svg.append(group);
      }
      const mark = (id, className, letter) => {
        const node = nodes.get(id); if (!node || node.floorId !== floorId) return;
        const group = svgNode('g', { 'pointer-events': 'none', 'aria-hidden': 'true' });
        group.append(svgNode('circle', { class: className, cx: node.x, cy: node.y, r: className === 'planCurrent' ? 18 : 15 }));
        group.append(svgNode('text', { x: node.x, y: node.y + 4, fill: '#fff', 'text-anchor': 'middle', 'font-size': 12, 'font-weight': 700 }, letter));
        svg.append(group);
      };
      mark(startSelect.value, 'planStart', 'A');
      if (route && ['ok', 'same-place'].includes(route.status)) {
        mark(route.steps.at(-1)?.toId || startSelect.value, 'planEnd', 'B');
        mark(nodeAtProgress()?.id, 'planCurrent', '•');
      } else if (nodes.has(destinationSelect.value)) mark(destinationSelect.value, 'planEnd', 'B');
    }

    function renderChoices() {
      const host = $('.routeChoices'); host.replaceChildren(); host.hidden = false;
      const currentPosition = nodeAtProgress()?.id;
      const choices = stepIndex > 0 && currentPosition ? computeRoutes(currentPosition, selectedGoal) : routes;
      for (const key of PROFILES) {
        const button = document.createElement('button'); button.type = 'button'; button.className = 'routeChoice';
        button.setAttribute('aria-pressed', String(profile === key));
        const title = document.createElement('strong'); title.className = 'routeChoiceTitle'; title.textContent = PROFILE_LABELS[key];
        const meta = document.createElement('span'); meta.className = 'routeChoiceMeta';
        const route = choices[key];
        const reachable = route && ['ok', 'same-place'].includes(route.status);
        meta.textContent = reachable ? `${stepIndex > 0 ? 'Sisa ' : ''}${distance(route.distanceM)} · ${minutes(route.durationSeconds)}` : 'Tidak ada jalur';
        const reason = document.createElement('span'); reason.className = 'routeChoiceReason'; reason.textContent = PROFILE_REASONS[key];
        button.disabled = !reachable; button.append(title, meta, reason);
        button.addEventListener('click', () => {
          const from = nodeAtProgress()?.id || startSelect.value;
          profile = key; findRoute({ fromId: from, goal: selectedGoal, announce: false });
        });
        host.append(button);
      }
    }
    function renderRoute() {
      $('#navRouteError').hidden = true; $('.navEmpty').hidden = true;
      renderChoices(); renderFloorTabs(); drawPlan();
      const route = currentRoute();
      if (!route || !['ok', 'same-place'].includes(route.status)) {
        $('.navRouteSummary').hidden = true;
        announceError('Belum ada jalur yang memenuhi batas akses pada denah latihan ini. Pilih titik lain atau atur ulang simulasi untuk membuka jalur yang ditutup.');
        return;
      }
      $('.navRouteSummary').hidden = false;
      const target = nodes.get(route.steps.at(-1)?.toId || startSelect.value);
      $('#navRouteTitle').textContent = `${PROFILE_LABELS[profile]} menuju ${target.label}`;
      $('#navRouteStats').textContent = `${distance(route.distanceM)} · sekitar ${minutes(route.durationSeconds)} · tanpa tangga`;
      $('#navRouteReason').textContent = `${PROFILE_REASONS[profile]} Perhitungan memakai data simulasi.`;
      const finished = stepIndex >= route.steps.length;
      const step = route.steps[stepIndex];
      $('#navProgress').textContent = finished ? 'SIMULASI SELESAI' : `SIMULASI · LANGKAH ${stepIndex + 1} DARI ${route.steps.length}`;
      $('#navInstruction').textContent = finished ? `Sampai di ${target.label} pada denah latihan.` : step.instruction;
      const current = nodeAtProgress();
      $('#navCurrentLocation').textContent = `Posisi simulasi: ${current?.label || 'titik awal'}. Posisi berubah hanya saat tombol langkah ditekan.`;
      $('#navPrevious').disabled = stepIndex === 0;
      $('#navNext').disabled = finished;
      $('#navNext').textContent = finished ? 'Simulasi selesai' : 'Simulasikan langkah berikutnya';
      $('#navBlockPath').disabled = finished;
      $('#navObstacleNote').textContent = blocked.size ? `${blocked.size} jalur ditutup dalam simulasi ini. Ubah mall atau gunakan “Atur ulang simulasi” untuk membukanya kembali.` : 'Coba tutup jalur berikutnya untuk mencari alternatif dari posisi simulasi.';
      const list = $('.navStepsList'); list.replaceChildren();
      for (const [index, item] of route.steps.entries()) {
        const li = document.createElement('li'); li.textContent = item.instruction;
        if (index === stepIndex) { li.className = 'isCurrent'; li.setAttribute('aria-current', 'step'); }
        list.append(li);
      }
      if (!route.steps.length) { const li = document.createElement('li'); li.textContent = 'Titik awal dan tujuan sama.'; list.append(li); }
    }

    const resetButton = document.createElement('button'); resetButton.type = 'button'; resetButton.className = 'button textButton';
    resetButton.id = 'navReset'; resetButton.textContent = 'Atur ulang simulasi'; resetButton.addEventListener('click', clear);
    const resetActions = document.createElement('div'); resetActions.className = 'navResetActions';
    resetActions.append(resetButton); container.append(resetActions);
    $('.navForm').addEventListener('submit', event => { event.preventDefault(); findRoute(); });
    startSelect.addEventListener('change', () => { if (nodes.has(startSelect.value)) floorId = nodes.get(startSelect.value).floorId; resetRoute(); renderFloorTabs(); });
    destinationSelect.addEventListener('change', () => { selectedGoal = destinationSelect.value; resetRoute(); });
    $('#navPrevious').addEventListener('click', () => { if (!stepIndex) return; cancelVoice(); stepIndex -= 1; floorId = nodeAtProgress().floorId; renderRoute(); });
    $('#navNext').addEventListener('click', () => { if (stepIndex >= (currentRoute()?.steps.length || 0)) return; cancelVoice(); stepIndex += 1; floorId = nodeAtProgress().floorId; renderRoute(); });
    $('#navBlockPath').addEventListener('click', () => {
      const route = currentRoute(); const step = route?.steps[stepIndex]; if (!step) return;
      const fromId = nodeAtProgress().id; const goal = selectedGoal;
      blocked.add(step.edgeId);
      const found = findRoute({ fromId, goal, announce: false });
      emit(found ? 'Jalur berikutnya ditutup pada simulasi. Rute alternatif sudah dihitung dari posisi simulasi terakhir.' : 'Jalur berikutnya ditutup pada simulasi. Tidak ada alternatif yang memenuhi batas akses; atur ulang simulasi atau pilih titik lain.');
    });
    $('#navVoice').disabled = !root.speechSynthesis || !root.SpeechSynthesisUtterance;
    $('#navVoice').setAttribute('aria-pressed', 'false');
    if ($('#navVoice').disabled) $('#navVoice').title = 'Pembacaan suara belum didukung browser ini.';
    $('#navVoice').addEventListener('click', () => {
      if (speaking) { cancelVoice(); return; }
      cancelVoice(); const generation = voiceGeneration;
      const utterance = new root.SpeechSynthesisUtterance(`Simulasi denah latihan. ${$('#navInstruction').textContent}`);
      utterance.lang = 'id-ID'; utterance.rate = 0.95; speaking = true;
      $('#navVoice').setAttribute('aria-pressed', 'true');
      $('#navVoice').textContent = 'Hentikan suara'; $('#navVoiceStatus').textContent = 'Membacakan langkah simulasi…';
      const done = () => { if (generation !== voiceGeneration) return; speaking = false; $('#navVoice').textContent = 'Dengarkan langkah'; $('#navVoice').setAttribute('aria-pressed', 'false'); $('#navVoiceStatus').textContent = ''; };
      utterance.onend = done; utterance.onerror = done;
      try { root.speechSynthesis.speak(utterance); }
      catch { done(); $('#navVoiceStatus').textContent = 'Suara belum dapat diputar. Petunjuk langkah tetap tersedia di atas.'; }
    });
    root.addEventListener('pagehide', cancelVoice);
    root.addEventListener('keydown', event => { if (event.key === 'Escape') cancelVoice(); });

    function resolve(text, type) {
      const cleaned = normalize(text).replace(/^(?:aku|saya)\s+(?:ada\s+)?di\s+/, '').replace(/^(?:di|dekat|dari)\s+/, '').trim();
      return engine.resolvePlace(plan, cleaned, type ? { type } : {}) || null;
    }
    function facilityGoal(id) {
      if (id === 'toilet') return 'nearest-toilet';
      const currentFloor = nodes.get(startSelect.value)?.floorId;
      const candidates = plan.nodes.filter(node => node.type === id);
      return candidates.find(node => node.floorId === currentFloor)?.id || candidates[0]?.id || null;
    }
    function chooseFacility(id) {
      const goal = facilityGoal(id); if (!goal) return false;
      destinationSelect.value = goal; selectedGoal = goal;
      if (!startSelect.value) {
        resetRoute(); emit('Pilih titik awal pada denah latihan, misalnya Pintu masuk GF atau Concierge GF. Setelah itu, aplikasi akan menghitung jalur menuju tujuanmu.');
        startSelect.focus();
      } else findRoute();
      return true;
    }
    function resolveGoal(text) {
      const exact = resolve(text); if (exact) return exact.id;
      let cleaned = normalize(text).replace(/^(?:ke|menuju)\s+/, '').replace(/\s+(?:dong|ya|tolong|terdekat)$/, '').trim();
      if (/^(?:toilet(?: difabel| disabilitas| aksesibel)?|wc|kamar kecil)(?: terdekat)?$/.test(cleaned)) return 'nearest-toilet';
      const types = { lift: 'lift', elevator: 'lift', parkir: 'parking', 'parkir difabel': 'parking', 'kursi roda': 'wheelchair', 'peminjaman kursi roda': 'wheelchair', 'pinjam kursi roda': 'wheelchair', 'pintu masuk': 'entrance', kafe: 'cafe', cafe: 'cafe' };
      return types[cleaned] ? facilityGoal(types[cleaned]) : null;
    }
    function handleMessage(text) {
      if (typeof text !== 'string' || text.length > 600) return false;
      let words = normalize(text);
      if (/\b(?:bukan|jangan|tidak|gak|nggak|enggak|batal|batalkan|atau)\b/.test(words) || (/\bdeli ?park\b/.test(words) && /\bsun ?plaza\b/.test(words))) {
        startSelect.value = ''; resetRoute();
        emit('Rute sebelumnya dihentikan. Permintaan ini belum menentukan satu perjalanan dengan jelas. Pilih titik awal dan tujuan pada denah latihan.');
        return true;
      }
      words = words.replace(/\b(?:mall |mal )?(?:deli ?park|sun ?plaza)(?: mall| mal)?\b/g, '').replace(/\s+/g, ' ').trim();
      const origin = words.match(/^(?:dari|(?:aku|saya)\s+(?:(?:sekarang|sedang|ada)\s+)?(?:di|dari)|(?:sekarang\s+)?di)\s+(.+?)(?:\s+(?:mau(?: pergi)?|ingin(?: pergi)?)?\s*(?:ke|menuju)\s+(.+))?$/)
        || (!/^(?:mau|ingin|tolong|antar|antarkan|arahkan|rute)\b/.test(words) ? words.match(/^(.+?)\s+(?:ke|menuju)\s+(.+)$/) : null);
      const destination = origin?.[2] || words.match(/(?:^|\s)(?:mau(?: pergi)?|ingin(?: pergi)?|antar(?:kan)?|arahkan|rute)?\s*(?:ke|menuju)\s+(.+)$/)?.[1] || words;
      const from = origin ? resolve(origin[1]) : null;
      if (origin) {
        selectStart(from?.id || '');
        if (from) floorId = from.floorId;
      }
      // Generic destinations (such as "lift") must use the new origin's floor.
      const goal = resolveGoal(destination);
      if (!origin && !goal) return false;
      if (origin) {
        if (!from) {
          resetRoute();
          if (goal) { destinationSelect.value = goal; selectedGoal = goal; }
          emit('Titik awal itu belum cocok dengan denah latihan. Pilih lokasi bernama pada pilihan “Titik awal”; lantai atau GPS saja belum menentukan koridor.');
          startSelect.focus(); return true;
        }
      }
      if (!goal) {
        resetRoute(); renderFloorTabs();
        emit(origin?.[2] ? 'Tujuan itu belum ada pada denah latihan. Pilih tujuan pada daftar di denah.' : `Titik awal simulasi ditetapkan di ${from.label}. Pilih tujuan, misalnya toilet difabel.`);
        return true;
      }
      destinationSelect.value = goal; selectedGoal = goal;
      if (!startSelect.value) {
        resetRoute(); emit('Pilih titik awal pada denah latihan atau ketik “dari pintu masuk ke toilet difabel”. Aplikasi akan membandingkan jalur setelah titik awal jelas.');
        startSelect.focus(); return true;
      }
      findRoute(); return true;
    }
    function setMall(mall) {
      if (!mall || mall.id === mallId) return;
      mallId = mall.id; clear();
      $('#navDemoDisclosure').textContent = `Denah latihan buatan ini tidak mewakili ${mall.name}. Coba cara aplikasi menghitung rute; jangan gunakan petunjuk ini untuk berjalan di mall sebenarnya.`;
    }
    renderFloorTabs(); drawPlan();
    return { setMall, clear, handleMessage, chooseFacility };
  }
  root.AksesinNavigator = { create };
})(typeof globalThis !== 'undefined' ? globalThis : this);
