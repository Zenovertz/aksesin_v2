// Node 22+: node tests/browser/smoke.cjs. No npm dependencies required.
// API responses and geolocation are fixtures; no real user location is read.
// Optional: BROWSER_PATH=/path/to/chromium SCREENSHOT_DIR=/tmp/aksesin-shots.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const { existsSync } = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

async function serveWorkspace() {
  const root = path.resolve(__dirname, '../../public');
  const records = { routes: [], chats: [], missing: [], routeError: false, aiEnabled: false };
  const types = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml',
    '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' };
  const json = (response, status, value) => {
    response.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    response.end(JSON.stringify(value));
  };
  const server = http.createServer(async (request, response) => {
    let pathname;
    try {
      pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
      if (pathname === '/favicon.ico') { response.writeHead(204).end(); return; }
      if (pathname === '/api/health') {
        json(response, 200, { aiEnabled: records.aiEnabled, mode: 'indoor', indoorPositioning: false }); return;
      }
      if (pathname === '/api/chat' || pathname === '/api/route') {
        let raw = '';
        for await (const chunk of request) raw += chunk;
        const body = raw ? JSON.parse(raw) : {};
        if (pathname === '/api/chat') {
          records.chats.push(body);
          json(response, 200, { source: 'local' }); return;
        }
        records.routes.push(body);
        if (records.routeError) {
          json(response, 503, { error: 'Layanan rute sedang tidak tersedia. Silakan coba lagi.' }); return;
        }
        json(response, 410, { code: 'INDOOR_ONLY' }); return;
      }
      const file = path.resolve(root, `.${pathname === '/' ? '/aksesin.html' : pathname}`);
      if (!file.startsWith(root + path.sep)) { response.writeHead(403).end(); return; }
      const contents = await fs.readFile(file);
      response.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
      response.end(contents);
    } catch {
      records.missing.push(pathname || request.url);
      response.writeHead(404).end();
    }
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  return { server, records, url: `http://127.0.0.1:${server.address().port}/aksesin.html` };
}

async function connect(debuggerUrl, errors) {
  const socket = new WebSocket(debuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });
  let sequence = 0;
  const pending = new Map();
  const listeners = new Map();
  socket.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails);
    if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') {
      errors.push({ console: message.params.args.map(item => item.value || item.description).join(' ') });
    }
    for (const callback of listeners.get(message.method) || []) {
      Promise.resolve(callback(message.params)).catch(error => errors.push({ cdp: error.message }));
    }
    if (!message.id) return;
    const handler = pending.get(message.id);
    if (!handler) return;
    pending.delete(message.id);
    clearTimeout(handler.timer);
    if (message.error) handler.reject(new Error(message.error.message));
    else handler.resolve(message.result);
  });
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++sequence;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`${method} timed out`)); }, 15000);
    pending.set(id, { resolve, reject, timer });
    socket.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async expression => {
    const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
    return result.result.value;
  };
  return { socket, send, evaluate, on(method, callback) {
    if (!listeners.has(method)) listeners.set(method, []);
    listeners.get(method).push(callback);
  } };
}

async function waitFor(client, expression, label) {
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    if (await client.evaluate(expression)) return;
    await new Promise(resolve => setTimeout(resolve, 40));
  }
  throw new Error(label);
}

async function installFixtures(page) {
  await page.send('Page.addScriptToEvaluateOnNewDocument', { source: `
    window.__geoMode = 'success';
    window.__geoCalls = 0;
    window.__geoPending = [];
    window.__releaseGeo = (outcome = 'success') => {
      const deliver = window.__geoPending.shift();
      if (!deliver) throw new Error('No deferred geolocation callback to release');
      deliver(outcome);
    };
    Object.defineProperty(navigator, 'geolocation', { configurable: true, value: {
      getCurrentPosition(success, failure) {
        window.__geoCalls += 1;
        const deliver = outcome => outcome === 'denied'
          ? failure({ code: 1, message: 'User denied geolocation' })
          : success({ coords: { latitude: outcome === 'outside' ? -6.2 : 3.580001, longitude: 98.670001,
              accuracy: outcome === 'coarse' ? 300 : 12, altitude: null, altitudeAccuracy: null, heading: null, speed: null }, timestamp: Date.now() });
        const mode = window.__geoMode;
        if (mode === 'deferred') window.__geoPending.push(deliver);
        else queueMicrotask(() => deliver(mode));
      },
      watchPosition() { throw new Error('The planner must not continuously track location.'); },
      clearWatch() {}
    } });
    window.__deferAi = false;
    window.__aiPending = [];
    window.__releaseAi = result => {
      const deliver = window.__aiPending.shift();
      if (!deliver) throw new Error('No deferred AI response to release');
      deliver(new Response(JSON.stringify(result), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    };
    const originalFetch = window.fetch.bind(window);
    window.fetch = (input, options) => {
      const address = typeof input === 'string' ? input : input.url;
      if (window.__deferAi && new URL(address, location.href).pathname === '/api/chat') {
        // Deliberately deliver even after abort, like a response already queued for processing.
        // This tests the stale-response guard as well as action-button cancellation.
        return new Promise(resolve => window.__aiPending.push(resolve));
      }
      return originalFetch(input, options);
    };
  ` });
}

async function ready(page) {
  await waitFor(page, `document.readyState === 'complete'
    && document.querySelectorAll('#mallCards .mallCard').length === 2
    && document.querySelectorAll('#chatLog .chatMessage.assistant').length > 0`, 'Wheelchair planner did not initialize');
  await page.evaluate(`window.__smoke = {
    select(id, value) {
      const field = document.getElementById(id); field.value = value;
      field.dispatchEvent(new Event('change', { bubbles: true }));
    },
    text(id, value) {
      const field = document.getElementById(id); field.value = value;
      field.dispatchEvent(new Event('input', { bubbles: true }));
    },
    assistantCount() { return document.querySelectorAll('#chatLog .chatMessage.assistant').length; },
    lastReply() { return [...document.querySelectorAll('#chatLog .chatMessage.assistant')].at(-1); },
    overflow() {
      return document.documentElement.scrollWidth > innerWidth + 1 || document.body.scrollWidth > innerWidth + 1;
    },
    largeControls() {
      return ['sendChat', 'savePositionButton', 'floorSelect', 'originInput'].every(id => {
        const box = document.getElementById(id).getBoundingClientRect();
        return box.width >= 44 && box.height >= 44;
      });
    }
  }; true`);
}

async function main() {
  assert.equal(typeof WebSocket, 'function', 'This browser smoke test requires Node 22 or later.');
  const executable = process.env.BROWSER_PATH || [
    '/Users/richard/Library/Caches/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-mac-arm64/chrome-headless-shell',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    '/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome',
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
  ].find(existsSync);
  assert.ok(executable, 'Set BROWSER_PATH to an installed Chromium browser.');
  const profile = await fs.mkdtemp(path.join(os.tmpdir(), 'aksesin-browser-test-'));
  const { server, records, url } = await serveWorkspace();
  const browser = spawn(executable, [
    '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    '--remote-debugging-port=0', '--remote-debugging-address=127.0.0.1',
    `--user-data-dir=${profile}`, 'about:blank'
  ], { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
  let page;
  try {
    const endpoint = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Browser startup timed out')), 15000);
      let output = '';
      browser.once('error', error => { clearTimeout(timer); reject(error); });
      browser.stderr.on('data', chunk => {
        if (process.env.BROWSER_DEBUG) process.stderr.write(chunk);
        output += chunk.toString();
        const match = output.match(/DevTools listening on (ws:\/\/[^\s]+)/);
        if (match) { clearTimeout(timer); resolve(match[1]); }
      });
      browser.once('exit', code => { clearTimeout(timer); reject(new Error(`Browser exited before connection: ${code}`)); });
    });
    const origin = new URL(endpoint);
    const tabs = await fetch(`http://${origin.host}/json/list`).then(response => response.json());
    const errors = [];
    page = await connect(tabs.find(tab => tab.type === 'page').webSocketDebuggerUrl, errors);
    const { send, evaluate } = page;
    const check = async (label, expression) => {
      assert.equal(await evaluate(expression), true, label);
      console.log(`PASS ${label}`);
    };
    const chat = async text => {
      const count = await evaluate('__smoke.assistantCount()');
      await evaluate(`__smoke.text('chatInput', ${JSON.stringify(text)}); document.getElementById('chatForm').requestSubmit(); true`);
      await waitFor(page, `__smoke.assistantCount() > ${count} && !document.getElementById('sendChat').disabled`, `No assistant response to: ${text}`);
    };
    const capture = async (filename, fullPage = false) => {
      if (!process.env.SCREENSHOT_DIR) return;
      await fs.mkdir(process.env.SCREENSHOT_DIR, { recursive: true });
      await evaluate(`document.activeElement?.blur(); document.documentElement.style.scrollBehavior = 'auto';
        window.scrollTo({top: 0, left: 0, behavior: 'instant'}); true`);
      await waitFor(page, `[...document.images].every(image => image.complete)`, 'Images not ready for capture');
      const options = { format: 'png', captureBeyondViewport: fullPage };
      if (fullPage) {
        const { cssContentSize } = await send('Page.getLayoutMetrics');
        options.clip = { x: 0, y: 0, width: cssContentSize.width, height: cssContentSize.height, scale: 1 };
      }
      const shot = await send('Page.captureScreenshot', options);
      await fs.writeFile(path.join(process.env.SCREENSHOT_DIR, filename), Buffer.from(shot.data, 'base64'));
    };
    await send('Page.enable');
    await send('Runtime.enable');
    await installFixtures(page);
    await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1080, deviceScaleFactor: 1, mobile: false });
    await send('Page.navigate', { url });
    await ready(page);
    await check('Indoor-only UI is initialized without outdoor routing or GPS requests', `document.querySelectorAll('#mallCards .mallCard').length === 2 && !document.querySelector('#map, #routeForm, #blindAssistant') && window.__geoCalls === 0 && document.getElementById('journeyPanel').hidden`);
    await check('Inputs are labelled and desktop layout has usable controls', `!__smoke.overflow() && __smoke.largeControls() && ['chatInput','floorSelect','originInput'].every(id => document.querySelector('label[for="'+id+'"]'))`);
    await capture('aksesin-indoor-desktop.png');
    await chat('Aku di GF Delipark, mau ke toilet difabel');
    await check('Chat displays sourced facility and explicitly user-reported floor', `document.getElementById('floorSelect').value === 'gf' && !document.getElementById('journeyPanel').hidden && document.getElementById('journeyDestination').textContent.includes('Setiap lantai') && /bukan posisi GPS/.test(document.getElementById('positionStatus').textContent) && __smoke.lastReply().querySelector('a').href === 'https://delipark.com/Facilities'`);
    await evaluate(`document.querySelector('[data-floor="l2"]').click(); true`);
    await check('Browsing a directory floor cannot change current floor', `document.getElementById('floorSelect').value === 'gf' && document.getElementById('journeyOrigin').textContent.includes('GF')`);
    await evaluate(`__smoke.text('originInput','dekat concierge'); document.getElementById('positionForm').requestSubmit(); true`);
    await check('Manual position confirms user text without GPS', `document.getElementById('positionStatus').textContent.includes('dekat concierge') && window.__geoCalls === 0`);
    await evaluate(`document.querySelector('[data-facility="wheelchair"]').click(); true`);
    await check('Assistance card displays the chosen position and facility without sending it', `!document.getElementById('journeyPanel').hidden && document.getElementById('journeyDestination').textContent.includes('Concierge')`);
    await evaluate(`document.getElementById('requestHelpButton').click(); true`);
    await check('Help dialog is a local screen card', `document.getElementById('helpDialog').open && document.getElementById('helpMessage').textContent.includes('dekat concierge') && document.getElementById('helpMessage').textContent.includes('tanpa tangga')`);
    await evaluate(`document.getElementById('closeHelpDialog').click(); __smoke.text('originInput','dekat toko lain'); true`);
    await check('Unsaved edits invalidate the old journey and position', `document.getElementById('journeyPanel').hidden && document.getElementById('positionStatus').textContent.includes('belum dikonfirmasi')`);
    await evaluate(`document.querySelector('[data-select-mall="sun-plaza"]').click(); true`);
    await check('Changing malls clears all old indoor position fields', `document.getElementById('floorSelect').value === '' && document.getElementById('originInput').value === '' && document.getElementById('journeyPanel').hidden`);
    await chat('Lift di Sun Plaza');
    await check('Sun Plaza facility is sourced without an invented doorway', `document.getElementById('journeyTitle').textContent.includes('Lift') && document.getElementById('journeyDestination').textContent.includes('belum dirinci') && document.getElementById('journeyOrigin').textContent === 'Belum ditentukan'`);
    await chat('toilet difabel');
    await chat('lift');
    await check('An explicit new facility replaces the previous request', `document.getElementById('journeyTitle').textContent.includes('Lift')`);
    await chat('<img src=x onerror="window.__xss=1">');
    await check('Unknown chat text is inert', `!window.__xss && !document.querySelector('#chatLog img') && __smoke.lastReply().textContent.includes('belum mengenali')`);
    await evaluate(`document.querySelector('[data-select-mall="delipark"]').click(); document.querySelector('.gpsDetails').open = true; document.getElementById('locationButton').click(); true`);
    await waitFor(page, `!document.getElementById('locationButton').disabled`, 'GPS fixture timed out');
    await check('GPS suggests an area but cannot set mall, floor, or indoor position', `document.getElementById('gpsSuggestion').textContent.includes('Sun Plaza') && document.getElementById('selectedMallName').textContent.includes('DeliPark') && document.getElementById('floorSelect').value === '' && document.getElementById('originInput').value === '' && /Lantai dan posisi dalam gedung tidak diketahui/.test(document.getElementById('locationStatus').textContent)`);
    await evaluate(`document.getElementById('gpsSuggestion').querySelector('button').click(); true`);
    await check('User must explicitly confirm the suggested mall', `document.getElementById('selectedMallName').textContent === 'Sun Plaza' && document.getElementById('floorSelect').value === ''`);
    await evaluate(`document.getElementById('clearLocationButton').click(); true`);
    for (const [mode, text] of [['denied','Izin lokasi ditolak'],['outside','tidak menunjukkan area Medan'],['coarse','terlalu luas']]) {
      await evaluate(`window.__geoMode=${JSON.stringify(mode)}; document.getElementById('locationButton').click(); true`);
      await waitFor(page, `document.getElementById('locationStatus').textContent.includes(${JSON.stringify(text)})`, `Missing GPS error ${mode}`);
      await check(`GPS ${mode} preserves manual selection`, `document.getElementById('selectedMallName').textContent === 'Sun Plaza' && !document.getElementById('gpsSuggestion').textContent`);
    }
    await evaluate(`window.__geoMode='deferred'; document.getElementById('locationButton').click(); true`);
    await chat('Aku di GF Delipark, mau ke toilet difabel');
    await evaluate(`window.__releaseGeo(); true`);
    await check('Late GPS cannot overwrite a newer indoor chat position', `document.getElementById('floorSelect').value === 'gf' && document.getElementById('selectedMallName').textContent.includes('DeliPark') && !document.getElementById('gpsSuggestion').textContent`);
    for (const width of [960, 390, 320]) {
      await send('Emulation.setDeviceMetricsOverride', { width, height: 1080, deviceScaleFactor: 1, mobile: width < 700 });
      await check(`Responsive layout and controls at ${width}px`, `!__smoke.overflow() && __smoke.largeControls() && ['chatInput','floorSelect','originInput'].every(id => parseFloat(getComputedStyle(document.getElementById(id)).fontSize) >= 16)`);
      if (width < 700) await capture(`aksesin-indoor-${width}.png`, true);
    }
    records.aiEnabled = true;
    await send('Page.navigate', { url }); await ready(page);
    await waitFor(page, `document.getElementById('assistantMode').textContent === 'AI diaktifkan'`, 'AI health fixture not loaded');
    await evaluate(`window.__geoMode='deferred'; document.getElementById('locationButton').click(); window.__deferAi=true; __smoke.text('chatInput','tolong pahami kalimat yang belum dikenal'); document.getElementById('chatForm').requestSubmit(); true`);
    await waitFor(page, `window.__aiPending.length === 1`, 'AI request was not deferred');
    await evaluate(`window.__releaseGeo(); document.querySelector('[data-facility="lift"]').click(); true`);
    await evaluate(`window.__releaseAi({source:'openai',intent:'indoor',mallId:'sun-plaza',floorId:'gf',originLabel:'toko lama',facility:'toilet'}); true`);
    await check('Delayed AI and GPS cannot replace the more recent facility choice', `document.getElementById('selectedMallName').textContent.includes('DeliPark') && document.getElementById('journeyTitle').textContent.includes('Lift') && document.getElementById('originInput').value === '' && !document.getElementById('sendChat').disabled`);
    assert.equal(records.routes.length, 0, 'Indoor UI must never request a road route');
    assert.deepEqual(records.missing, [], 'Local assets must exist');
    assert.deepEqual(errors, [], 'No browser JavaScript errors');
    console.log('PASS No outdoor route calls, missing assets, or browser errors');
    console.log('Indoor browser smoke passed (mock GPS and AI; no user location read).');

  } finally {
    if (page) page.socket.close();
    if (browser.exitCode === null) browser.kill();
    if (browser.exitCode === null) await new Promise(resolve => browser.once('exit', resolve));
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
    const resolved = path.resolve(profile);
    assert.equal(path.dirname(resolved), path.resolve(os.tmpdir()));
    assert.ok(path.basename(resolved).startsWith('aksesin-browser-test-'));
    await fs.rm(resolved, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
