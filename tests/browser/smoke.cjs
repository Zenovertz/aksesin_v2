// Node 22+: node tests/browser/smoke.cjs. No npm dependencies required.
// API responses, Cesium, remote images, and geolocation are fixtures.
// No real user location or external map/image service is accessed.
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
  const records = { routes: [], chats: [], missing: [], mapConfigs: 0, routeError: false, aiEnabled: false };
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
      if (pathname === '/api/config/maps') {
        records.mapConfigs++;
        json(response, 200, { provider: 'cesium', ionAccessToken: null, enable3d: false }); return;
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

function cesiumFixture() {
  const state = window.__cesiumMock = { viewers: [], flyTo: [], setView: [], remoteFeatures: [] };
  class Event {
    constructor() { this.listeners = []; }
    addEventListener(callback) { this.listeners.push(callback); return () => this.removeEventListener(callback); }
    removeEventListener(callback) { this.listeners = this.listeners.filter(item => item !== callback); }
  }
  class Color {
    constructor(value, alpha = 1) { this.value = value; this.alpha = alpha; }
    withAlpha(alpha) { return new Color(this.value, alpha); }
    static fromCssColorString(value) { return new Color(value); }
  }
  for (const name of ['WHITE', 'BLACK', 'BLUE', 'ORANGE', 'RED', 'TRANSPARENT', 'YELLOW', 'CYAN']) Color[name] = new Color(name);
  class EntityCollection {
    constructor() { this.values = []; }
    add(entity) {
      if (entity.id && this.getById(entity.id)) throw new Error('Duplicate Cesium fixture entity: ' + entity.id);
      this.values.push(entity); return entity;
    }
    getById(id) { return this.values.find(entity => entity.id === id); }
    remove(entity) { const before = this.values.length; this.values = this.values.filter(item => item !== entity); return this.values.length !== before; }
    removeById(id) { return this.remove(this.getById(id)); }
    removeAll() { this.values = []; }
  }
  class EllipsoidTerrainProvider {}
  class OpenStreetMapImageryProvider { constructor(options) { this.options = options; } }
  class ImageryLayer { constructor(provider, options) { this.imageryProvider = provider; this.options = options; } }
  class Viewer {
    constructor(container, options) {
      this.container = typeof container === 'string' ? document.getElementById(container) : container;
      if (!(this.container instanceof HTMLElement)) throw new Error('Cesium fixture needs a real DOM container');
      this.options = options;
      this.entities = new EntityCollection();
      this.canvas = document.createElement('canvas');
      this.canvas.setAttribute('aria-label', 'Cesium test map');
      this.canvas.style.cssText = 'display:block;width:100%;height:100%';
      this.container.append(this.canvas);
      this.camera = {
        flyTo: options => { state.flyTo.push(options); options.complete?.(); },
        setView: options => { state.setView.push(options); }
      };
      this.scene = { canvas: this.canvas, globe: {}, requestRender() {}, renderError: new Event(),
        primitives: { add: value => value }, screenSpaceCameraController: {} };
      this.imageryLayers = { values: [], removeAll() { this.values = []; }, addImageryProvider(provider) { this.values.push(provider); return provider; } };
      this.terrainProvider = options?.terrainProvider;
      this.cesiumWidget = { creditContainer: document.createElement('div') };
      this.screenSpaceEventHandler = { removeInputAction() {} };
      this._destroyed = false;
      state.viewers.push(this);
    }
    resize() {}
    isDestroyed() { return this._destroyed; }
    destroy() { this._destroyed = true; this.canvas.remove(); }
    flyTo(target, options) { state.flyTo.push({ target, ...options }); return Promise.resolve(true); }
  }
  window.Cesium = {
    VERSION: 'test-fixture', Ion: { defaultAccessToken: 'fixture-default-must-be-cleared' },
    Viewer, Color, EllipsoidTerrainProvider, OpenStreetMapImageryProvider, ImageryLayer,
    Credit: class { constructor(html, showOnScreen) { Object.assign(this, { html, showOnScreen }); } },
    Cartesian3: { fromDegrees: (longitude, latitude, height = 0) => ({ longitude, latitude, height }) },
    Cartesian2: class { constructor(x, y) { this.x = x; this.y = y; } },
    Math: { toRadians: degrees => degrees * Math.PI / 180 },
    Rectangle: { fromDegrees: (west, south, east, north) => ({ west, south, east, north }) },
    HeightReference: { NONE: 0, CLAMP_TO_GROUND: 1 }, VerticalOrigin: { CENTER: 0, BOTTOM: 1 },
    HorizontalOrigin: { CENTER: 0, LEFT: 1 }, LabelStyle: { FILL_AND_OUTLINE: 2 },
    ScreenSpaceEventType: { LEFT_DOUBLE_CLICK: 1 },
    NearFarScalar: class { constructor(near, nearValue, far, farValue) { Object.assign(this, { near, nearValue, far, farValue }); } },
    DistanceDisplayCondition: class { constructor(near, far) { Object.assign(this, { near, far }); } },
    createWorldTerrainAsync: async () => { state.remoteFeatures.push('terrain'); throw new Error('Token-free view must not request ion terrain'); },
    createOsmBuildingsAsync: async () => { state.remoteFeatures.push('buildings'); throw new Error('Token-free view must not request ion buildings'); }
  };
}

async function installExternalFixtures(page, appUrl) {
  const localOrigin = new URL(appUrl).origin;
  const records = { cesiumScripts: [], cesiumStyles: [], images: [], unexpected: [], failNextStyle: false };
  const tinyImage = '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400"><rect width="600" height="400" fill="#ded9cf"/></svg>';
  page.on('Fetch.requestPaused', async ({ requestId, request, resourceType }) => {
    const target = new URL(request.url);
    if (target.origin === localOrigin || !['http:', 'https:'].includes(target.protocol)) {
      await page.send('Fetch.continueRequest', { requestId }); return;
    }
    let body = '';
    let contentType = 'text/plain';
    let responseCode = 200;
    if (target.hostname === 'cesium.com' && /\/Cesium\.js$/.test(target.pathname)) {
      records.cesiumScripts.push(request.url); body = `(${cesiumFixture.toString()})();`; contentType = 'text/javascript';
    } else if (target.hostname === 'cesium.com' && /\/widgets\.css$/.test(target.pathname)) {
      records.cesiumStyles.push(request.url); body = '.cesium-widget,.cesium-widget canvas{width:100%;height:100%}'; contentType = 'text/css';
      if (records.failNextStyle) { records.failNextStyle = false; responseCode = 503; body = ''; }
    } else if (resourceType === 'Image') {
      records.images.push(request.url); body = tinyImage; contentType = 'image/svg+xml';
    } else {
      records.unexpected.push({ url: request.url, resourceType });
    }
    await page.send('Fetch.fulfillRequest', { requestId, responseCode,
      responseHeaders: [{ name: 'Content-Type', value: contentType }, { name: 'Access-Control-Allow-Origin', value: '*' }],
      body: Buffer.from(body).toString('base64') });
  });
  await page.send('Fetch.enable', { patterns: [{ urlPattern: '*', requestStage: 'Request' }] });
  return records;
}

async function installFixtures(page) {
  await page.send('Page.addScriptToEvaluateOnNewDocument', { source: `
    window.__voice = { utterances: [], cancelled: 0 };
    Object.defineProperty(window, 'SpeechSynthesisUtterance', { configurable: true, value: class {
      constructor(text) { this.text = text; }
    } });
    Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: {
      speak(utterance) { window.__voice.utterances.push(utterance); },
      cancel() { window.__voice.cancelled++; }
    } });
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
      return ['sendChat', 'navStart', 'navDestination', 'navFindRoute'].every(id => {
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
    const external = await installExternalFixtures(page, url);
    await installFixtures(page);
    await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1080, deviceScaleFactor: 1, mobile: false });
    await send('Page.navigate', { url });
    await ready(page);
    await check('Indoor-only UI is initialized without outdoor routing or GPS requests', `document.querySelectorAll('#mallCards .mallCard').length === 2 && !document.querySelector('#map, #routeForm, #blindAssistant') && window.__geoCalls === 0 && document.getElementById('journeyPanel').hidden`);
    await check('Inputs are labelled and desktop layout has usable controls', `!__smoke.overflow() && __smoke.largeControls() && ['chatInput','navStart','navDestination'].every(id => document.querySelector('label[for="'+id+'"]'))`);
    assert.equal(external.cesiumScripts.length, 0, 'Cesium script must load only after opening the map');
    assert.equal(external.cesiumStyles.length, 0, 'Cesium styles must load only after opening the map');
    assert.equal(records.mapConfigs, 0, 'Map configuration must load only after opening the map');
    await check('Cesium stays unloaded until requested', `!window.Cesium && document.getElementById('cesiumViewport').hidden && window.__geoCalls === 0`);
    await evaluate(`document.getElementById('areaMapDetails').open = true; document.getElementById('loadCesiumMap').click(); true`);
    await waitFor(page, `window.__cesiumMock?.viewers.length === 1 && !document.getElementById('cesiumToolbar').hidden`, 'Cesium fixture did not initialize');
    await check('Token-free map uses OSM, ellipsoid terrain, and visible attribution', `(() => {
      const options = __cesiumMock.viewers[0].options;
      const imagery = options.baseLayer.imageryProvider;
      return Cesium.Ion.defaultAccessToken === '' && options.terrainProvider instanceof Cesium.EllipsoidTerrainProvider
        && imagery instanceof Cesium.OpenStreetMapImageryProvider && imagery.options.url === 'https://tile.openstreetmap.org/'
        && imagery.options.credit.showOnScreen === true && imagery.options.credit.html.includes('openstreetmap.org/copyright')
        && options.geocoder === false && options.baseLayerPicker === false && __cesiumMock.remoteFeatures.length === 0;
    })()`);
    await check('Map marks both mall areas without inventing indoor facility pins', `(() => {
      const entities = __cesiumMock.viewers[0].entities.values;
      return entities.length === 2 && ['mall-delipark','mall-sun-plaza'].every(id => entities.some(entity => entity.id === id))
        && entities.every(entity => entity.label.text.startsWith('Area ')) && window.__geoCalls === 0;
    })()`);
    assert.equal(external.cesiumScripts.length, 1, 'One Cesium library request');
    assert.equal(external.cesiumStyles.length, 1, 'One Cesium stylesheet request');
    assert.equal(records.mapConfigs, 1, 'One public map configuration request');
    await chat('Aku di GF Delipark, mau ke toilet difabel');
    await check('A floor alone asks for a named start instead of inventing an indoor position', `document.getElementById('navStart').value === '' && document.querySelector('.navRouteSummary').hidden && !document.querySelector('.planRoute') && __smoke.lastReply().textContent.includes('Titik awal') && !__smoke.lastReply().textContent.includes('satpam')`);
    await chat('dari pintu masuk ke toilet difabel');
    await check('Chat calculates three indoor route choices and draws a route', `document.getElementById('navStart').value === 'entrance-gf' && document.querySelectorAll('.routeChoice').length === 3 && document.querySelectorAll('.planRoute').length > 0 && !document.querySelector('.navRouteSummary').hidden && document.getElementById('navRouteStats').textContent.includes('tanpa tangga') && document.getElementById('navDemoDisclosure').textContent.includes('tidak mewakili DeliPark')`);
    await evaluate(`document.getElementById('areaMapDetails').open = false; true`);
    await capture('aksesin-indoor-desktop.png');
    const recommendedDistance = await evaluate(`document.getElementById('navRouteStats').textContent`);
    await evaluate(`document.querySelectorAll('.routeChoice')[1].click(); true`);
    await check('The shortest route is a different eligible route', `document.getElementById('navRouteTitle').textContent.startsWith('Terpendek') && document.getElementById('navRouteStats').textContent !== ${JSON.stringify(recommendedDistance)} && document.querySelectorAll('.routeChoice')[1].getAttribute('aria-pressed') === 'true'`);
    await evaluate(`document.querySelectorAll('.routeChoice')[2].click(); true`);
    await check('The fastest route has its own time estimate', `document.getElementById('navRouteTitle').textContent.startsWith('Tercepat') && /sekitar/.test(document.getElementById('navRouteStats').textContent)`);
    await evaluate(`document.querySelectorAll('.routeChoice')[0].click(); document.getElementById('navVoice').click(); true`);
    await check('Voice reads the visible step without using external services', `__voice.utterances.length === 1 && __voice.utterances[0].text.includes(document.getElementById('navInstruction').textContent) && __voice.utterances[0].lang === 'id-ID' && document.getElementById('navVoice').getAttribute('aria-pressed') === 'true'`);
    await evaluate(`document.getElementById('navNext').click(); true`);
    await check('Explicit progress moves the simulation and cancels the old spoken instruction', `document.getElementById('navCurrentLocation').textContent.includes('Simpang barat') && document.getElementById('navProgress').textContent.includes('LANGKAH 2') && __voice.cancelled === 1 && document.getElementById('navVoice').getAttribute('aria-pressed') === 'false' && window.__geoCalls === 0`);
    await evaluate(`document.getElementById('navBlockPath').click(); true`);
    await check('Blocking a path recalculates from the reached junction', `document.getElementById('navStart').value === 'west-gf' && document.querySelectorAll('#navStart [data-current-junction]').length === 1 && !document.querySelector('.navRouteSummary').hidden && document.querySelector('.planBlocked') && document.getElementById('navCurrentLocation').textContent.includes('Simpang barat')`);
    await evaluate(`document.getElementById('navReset').click(); true`);
    await chat('dari pintu masuk ke toilet difabel');
    await evaluate(`document.getElementById('navBlockPath').click(); true`);
    await check('An unreachable route removes guidance but leaves reset accessible', `!document.getElementById('navRouteError').hidden && document.querySelector('.navRouteSummary').hidden && !document.querySelector('.planRoute') && document.getElementById('navReset').getBoundingClientRect().height >= 44`);
    await evaluate(`document.getElementById('navReset').click(); true`);
    await chat('dari concierge ke kafe L1');
    await check('Cross-floor wheelchair guidance uses a lift and no stair instructions', `document.getElementById('navDestination').value === 'cafe-l1' && document.querySelector('.navStepsList').textContent.includes('lift') && !/(?:naik|turun|gunakan) tangga/i.test(document.querySelector('.navStepsList').textContent)`);
    await evaluate(`__smoke.select('navStart','toilet-gf'); __smoke.select('navDestination','toilet-gf'); document.querySelector('.navForm').requestSubmit(); true`);
    await check('Identical start and destination finish without a fabricated journey', `document.getElementById('navRouteStats').textContent.startsWith('0 m') && document.getElementById('navNext').disabled && document.getElementById('navProgress').textContent === 'SIMULASI SELESAI' && !document.querySelector('.planRoute')`);
    await chat('dari pintu masuk ke toilet difabel');
    await chat('dari toko xyz ke toilet difabel');
    await check('An unknown new origin clears the previous route and never reuses its start', `document.getElementById('navStart').value === '' && document.querySelector('.navRouteSummary').hidden && !document.querySelector('.planRoute') && __smoke.lastReply().textContent.includes('Titik awal')`);
    await chat('dari pintu masuk ke toilet difabel');
    await chat('dari toko yang tidak dikenal ke toilet difabel');
    await check('An ambiguous or negated origin also cancels the old route', `document.getElementById('navStart').value === '' && document.querySelector('.navRouteSummary').hidden && !document.querySelector('.planRoute') && __smoke.lastReply().textContent.includes('Rute sebelumnya dihentikan')`);
    await evaluate(`document.getElementById('mallReference').open = true; __smoke.select('floorSelect','gf'); __smoke.text('originInput','dekat concierge'); document.getElementById('positionForm').requestSubmit(); document.querySelector('[data-floor="l2"]').click(); true`);
    await check('Real mall reference details do not set the simulated starting point', `document.getElementById('floorSelect').value === 'gf' && document.getElementById('navStart').value === '' && document.getElementById('positionStatus').textContent.includes('dekat concierge') && window.__geoCalls === 0`);
    await evaluate(`document.querySelector('[data-facility="wheelchair"]').click(); true`);
    await check('Assistance card displays the chosen position and facility without sending it', `!document.getElementById('journeyPanel').hidden && document.getElementById('journeyDestination').textContent.includes('Concierge')`);
    await check('Wheelchair location has a small sourced photo in the detail and chat', `(() => {
      const image = document.querySelector('#journeyPhoto img');
      const bounds = image?.getBoundingClientRect();
      return image?.getAttribute('width') === '96' && image.getAttribute('height') === '72'
        && bounds.width >= 44 && bounds.width <= 96 && bounds.height === 72 && image.alt.includes('concierge')
        && document.querySelector('#journeyPhoto .facilityPhotoBadge').textContent === 'Foto lokasi resmi'
        && __smoke.lastReply().querySelector('.facilityPhotoImage') !== null;
    })()`);
    await evaluate(`document.querySelector('#journeyPhoto .facilityPhotoButton').click(); true`);
    await waitFor(page, `document.getElementById('facilityPhotoDialog').open && document.getElementById('facilityPhotoLarge').complete`, 'Photo dialog did not open');
    await check('Photo preview retains its caption and official source', `document.getElementById('facilityPhotoCaption').textContent.includes('DeliPark') && document.getElementById('facilityPhotoSource').href === 'https://delipark.com/DetilFacilities/getinfo/Wheel_Chair' && !document.getElementById('facilityPhotoLarge').hidden`);
    await evaluate(`document.getElementById('closeFacilityPhoto').click(); true`);
    await waitFor(page, `!document.getElementById('facilityPhotoDialog').open && !document.getElementById('facilityPhotoLarge').hasAttribute('src')`, 'Photo dialog did not close and release its image');
    await evaluate(`document.querySelector('#journeyPhoto img').dispatchEvent(new Event('error')); true`);
    await check('Unavailable photo falls back to a message and official source', `!document.querySelector('#journeyPhoto img') && document.querySelector('#journeyPhoto .facilityPhotoPlaceholder').textContent.includes('tidak dapat dimuat') && document.querySelector('#journeyPhoto a').href === 'https://delipark.com/DetilFacilities/getinfo/Wheel_Chair'`);
    await check('Facility without a photo shows an honest fallback', `(() => {
      const mall = AksesinMalls.getMall('delipark');
      const item = mall.facilities.find(item => item.id === 'wheelchair');
      const card = AksesinFacilityPhoto.create({ ...item, photo: null }, mall);
      return !card.querySelector('img,button') && card.textContent.includes('Foto belum tersedia')
        && card.querySelector('a').href === item.sourceUrl;
    })()`);
    await evaluate(`document.getElementById('demoFacilityButton').click(); true`);
    await check('Facility reference can open a navigation goal without pretending to know the starting point', `document.getElementById('navDestination').value === 'wheelchair-gf' && document.getElementById('navStart').value === '' && !document.getElementById('helpDialog') && !document.getElementById('requestHelpButton')`);
    await evaluate(`__smoke.text('originInput','dekat toko lain'); true`);
    await check('Unsaved edits invalidate the old journey and position', `document.getElementById('journeyPanel').hidden && document.getElementById('positionStatus').textContent.includes('belum dikonfirmasi')`);
    await evaluate(`document.querySelector('[data-select-mall="sun-plaza"]').click(); true`);
    await check('Changing malls clears all old indoor position fields', `document.getElementById('floorSelect').value === '' && document.getElementById('originInput').value === '' && document.getElementById('journeyPanel').hidden`);
    await check('Changing mall moves the map camera to the selected building area', `(() => {
      const mall = AksesinMalls.getMall('sun-plaza');
      const destination = __cesiumMock.flyTo.at(-1).destination;
      return destination.latitude === mall.lat && destination.longitude === mall.lon
        && __cesiumMock.viewers[0].entities.getById('mall-sun-plaza').point.pixelSize === 15;
    })()`);
    await evaluate(`document.querySelector('[data-facility="lift"]').click(); true`);
    await check('Sun Plaza reference remains sourced without an invented doorway', `document.getElementById('journeyTitle').textContent.includes('Lift') && document.getElementById('journeyDestination').textContent.includes('belum dirinci') && document.getElementById('journeyOrigin').textContent === 'Belum ditentukan'`);
    await chat('toilet difabel');
    await chat('lift');
    await check('An explicit new navigation goal replaces the previous request', `document.getElementById('navDestination').value.startsWith('lift-') && document.getElementById('navStart').value === ''`);
    await chat('<img src=x onerror="window.__xss=1">');
    await check('Unknown chat text is inert', `!window.__xss && !document.querySelector('#chatLog img[src="x"]') && __smoke.lastReply().textContent.includes('belum mengenali')`);
    await evaluate(`document.querySelector('[data-select-mall="delipark"]').click(); true`);
    await chat('dari pintu masuk ke toilet difabel');
    await evaluate(`document.getElementById('navNext').click(); window.__navBeforeGps = { start: document.getElementById('navStart').value, instruction: document.getElementById('navInstruction').textContent, position: document.getElementById('navCurrentLocation').textContent }; document.getElementById('areaMapDetails').open = true; document.getElementById('cesiumLocateButton').click(); true`);
    await waitFor(page, `!document.getElementById('locationButton').disabled`, 'GPS fixture timed out');
    await check('GPS suggests an area but cannot set mall, floor, or indoor position', `document.getElementById('gpsSuggestion').textContent.includes('Sun Plaza') && document.getElementById('selectedMallName').textContent.includes('DeliPark') && document.getElementById('floorSelect').value === '' && document.getElementById('originInput').value === '' && /Lantai dan posisi dalam gedung tidak diketahui/.test(document.getElementById('locationStatus').textContent)`);
    await check('GPS leaves the active indoor route and explicit progress unchanged', `document.getElementById('navStart').value === __navBeforeGps.start && document.getElementById('navInstruction').textContent === __navBeforeGps.instruction && document.getElementById('navCurrentLocation').textContent === __navBeforeGps.position`);
    await check('Map location uses the same requested GPS fix and accuracy radius', `(() => {
      const entities = __cesiumMock.viewers[0].entities;
      const point = entities.getById('device-location');
      const circle = entities.getById('device-accuracy');
      return window.__geoCalls === 1 && point.position.latitude === 3.580001 && point.position.longitude === 98.670001
        && point.label.text === 'Perkiraan ±12 m' && circle.ellipse.semiMajorAxis === 12 && circle.ellipse.semiMinorAxis === 12
        && document.getElementById('floorSelect').value === '';
    })()`);
    await evaluate(`document.getElementById('gpsSuggestion').querySelector('button').click(); true`);
    await check('User must explicitly confirm the suggested mall', `document.getElementById('selectedMallName').textContent === 'Sun Plaza' && document.getElementById('floorSelect').value === ''`);
    await evaluate(`document.getElementById('clearLocationButton').click(); true`);
    await check('Clearing device location removes both the dot and accuracy circle', `__cesiumMock.viewers[0].entities.values.length === 2 && !__cesiumMock.viewers[0].entities.getById('device-location') && !__cesiumMock.viewers[0].entities.getById('device-accuracy') && document.getElementById('floorSelect').value === ''`);
    for (const [mode, text] of [['denied','Izin lokasi ditolak'],['outside','tidak menunjukkan area Medan'],['coarse','terlalu luas']]) {
      await evaluate(`window.__geoMode=${JSON.stringify(mode)}; document.getElementById('locationButton').click(); true`);
      await waitFor(page, `document.getElementById('locationStatus').textContent.includes(${JSON.stringify(text)})`, `Missing GPS error ${mode}`);
      await check(`GPS ${mode} preserves manual selection`, `document.getElementById('selectedMallName').textContent === 'Sun Plaza' && !document.getElementById('gpsSuggestion').textContent`);
    }
    await evaluate(`window.__geoMode='deferred'; document.getElementById('locationButton').click(); true`);
    await chat('Aku di GF Delipark, mau ke toilet difabel');
    await evaluate(`window.__releaseGeo(); true`);
    await check('Late GPS cannot invent a position for a newer indoor chat request', `document.getElementById('navStart').value === '' && document.getElementById('floorSelect').value === '' && document.getElementById('selectedMallName').textContent.includes('DeliPark') && !document.getElementById('gpsSuggestion').textContent`);
    await chat('dari pintu masuk ke toilet difabel');
    await evaluate(`document.getElementById('areaMapDetails').open = false; document.getElementById('mallReference').open = false; true`);
    for (const width of [960, 390, 320]) {
      await send('Emulation.setDeviceMetricsOverride', { width, height: 1080, deviceScaleFactor: 1, mobile: width < 700 });
      await check(`Responsive layout and controls at ${width}px`, `!__smoke.overflow() && __smoke.largeControls() && ['chatInput','navStart','navDestination'].every(id => parseFloat(getComputedStyle(document.getElementById(id)).fontSize) >= 16)`);
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
    const previousScripts = external.cesiumScripts.length;
    const previousStyles = external.cesiumStyles.length;
    external.failNextStyle = true;
    await send('Page.navigate', { url }); await ready(page);
    await evaluate(`document.getElementById('areaMapDetails').open = true; document.getElementById('loadCesiumMap').click(); true`);
    await waitFor(page, `document.getElementById('cesiumMapStatus').dataset.state === 'error' && !document.getElementById('loadCesiumMap').disabled`, 'Failed map stylesheet did not show a retry action');
    await check('A failed map stylesheet leaves chat usable and offers retry', `window.Cesium && __cesiumMock.viewers.length === 0 && document.getElementById('cesiumViewport').hidden && !document.getElementById('sendChat').disabled && !document.getElementById('loadCesiumMap').hidden`);
    await evaluate(`document.getElementById('areaMapDetails').open = true; document.getElementById('loadCesiumMap').click(); true`);
    await waitFor(page, `__cesiumMock.viewers.length === 1 && !document.getElementById('cesiumToolbar').hidden`, 'Retry did not recover from a stylesheet failure');
    assert.equal(external.cesiumScripts.length - previousScripts, 1, 'Retry reuses the already loaded Cesium script');
    assert.equal(external.cesiumStyles.length - previousStyles, 2, 'Retry reloads the failed Cesium stylesheet');
    console.log('PASS Map retries a failed stylesheet after the Cesium script has loaded');
    assert.equal(records.routes.length, 0, 'Indoor UI must never request a road route');
    assert.deepEqual(records.missing, [], 'Local assets must exist');
    assert.ok(external.images.length > 0, 'Official photo requests must be intercepted by image fixtures');
    assert.deepEqual(external.unexpected, [], 'No unmocked external services may be requested');
    assert.deepEqual(errors, [], 'No browser JavaScript errors');
    console.log('PASS No outdoor route calls, missing assets, or browser errors');
    console.log('Indoor browser smoke passed (mock GPS, voice, AI, Cesium, and photos; no external services or user location read).');

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
