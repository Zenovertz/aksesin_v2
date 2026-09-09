// Node 22+: node tests/browser-smoke.cjs (installed Chrome/Edge; no packages).
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const { existsSync } = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

async function serveWorkspace() {
  const root = path.resolve(__dirname, '..');
  const types = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml',
    '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' };
  const server = http.createServer(async (request, response) => {
    try {
      const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
      const file = path.resolve(root, `.${pathname === '/' ? '/aksesin.html' : pathname}`);
      if (!file.startsWith(root + path.sep)) { response.writeHead(403).end(); return; }
      const contents = await fs.readFile(file);
      response.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
      response.end(contents);
    } catch { response.writeHead(404).end(); }
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  return { server, url: `http://127.0.0.1:${server.address().port}/aksesin.html` };
}

async function connect(debuggerUrl, errors) {
  const socket = new WebSocket(debuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });
  let sequence = 0;
  const pending = new Map();
  socket.addEventListener('message', event => {
    if (process.env.BROWSER_DEBUG) console.log('CDP', String(event.data).slice(0, 500));
    const message = JSON.parse(event.data);
    if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails);
    if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') {
      errors.push({ console: message.params.args.map(item => item.value || item.description).join(' ') });
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
  return { socket, send, evaluate };
}

async function waitFor(client, expression, label) {
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    if (await client.evaluate(expression)) return;
    await new Promise(resolve => setTimeout(resolve, 30));
  }
  throw new Error(label);
}

async function ready(client) {
  await waitFor(client, `document.readyState === 'complete' && typeof AksesinData === 'object'
    && typeof appState === 'object' && !!document.getElementById('preferencesForm')`, 'Recommendation page did not initialize');
  await client.evaluate(`window.__smoke = {
    select(id, value) {
      const input = document.getElementById(id); input.value = value;
      input.dispatchEvent(new Event('change', { bubbles: true }));
    },
    text(id, value) {
      const input = document.getElementById(id); input.value = value;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    },
    radio(name, value) {
      const input = [...document.querySelectorAll('input[name="' + name + '"]')].find(item => item.value === String(value));
      if (!input) throw new Error('Missing radio ' + name + '=' + value); input.click();
    },
    cards() { return [...document.querySelectorAll('#pathCards .pathCard[data-card-path]')].map(card => card.dataset.cardPath); },
    save(id) { document.querySelector('[data-save="' + id + '"]').click(); },
    detail(id) { document.querySelector('[data-path="' + id + '"]').click(); },
    openReport() { document.querySelector('#pathDetail [data-report]').click(); },
    report(author, rating, condition, comment) {
      this.text('reportAuthor', author); this.radio('rating', rating);
      this.radio('condition', condition); this.text('reportComment', comment);
    }
  }; true`);
}

async function main() {
  const executable = process.env.BROWSER_PATH || [
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
  ].find(existsSync);
  assert.ok(executable, 'Set BROWSER_PATH to an installed Chromium browser.');
  const profile = await fs.mkdtemp(path.join(os.tmpdir(), 'aksesin-browser-test-'));
  const { server, url } = await serveWorkspace();
  const browser = spawn(executable, [
    '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    '--remote-debugging-port=0', '--remote-debugging-address=127.0.0.1',
    `--user-data-dir=${profile}`, 'about:blank'
  ], { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
  const clients = [];
  try {
    const endpoint = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Browser startup timed out')), 15000);
      let output = '';
      browser.on('error', error => { clearTimeout(timer); reject(error); });
      browser.stderr.on('data', chunk => {
        if (process.env.BROWSER_DEBUG) process.stderr.write(chunk);
        output += chunk.toString();
        const match = output.match(/DevTools listening on (ws:\/\/[^\s]+)/);
        if (match) { clearTimeout(timer); resolve(match[1]); }
      });
      browser.on('exit', code => { clearTimeout(timer); reject(new Error(`Browser exited before connection: ${code}`)); });
    });
    const origin = new URL(endpoint);
    const tabs = await fetch(`http://${origin.host}/json/list`).then(result => result.json());
    const errors = [];
    const page = await connect(tabs.find(tab => tab.type === 'page').webSocketDebuggerUrl, errors);
    clients.push(page);
    const { send, evaluate } = page;
    const check = async (label, expression) => {
      assert.equal(await evaluate(expression), true, label); console.log(`PASS ${label}`);
    };
    const capture = async (filename, selector, fullPage = false) => {
      if (!process.env.SCREENSHOT_DIR) return;
      await fs.mkdir(process.env.SCREENSHOT_DIR, { recursive: true });
      await evaluate(`document.documentElement.style.scrollBehavior = 'auto';
        document.getElementById('toast')?.classList.remove('show');
        document.activeElement?.blur();
        ${fullPage ? "window.scrollTo({top:0,left:0,behavior:'instant'})" : `document.querySelector(${JSON.stringify(selector)}).scrollIntoView({behavior:'instant',block:'center'})`}; true`);
      const options = { format: 'png', captureBeyondViewport: fullPage };
      if (fullPage) {
        const { cssContentSize } = await send('Page.getLayoutMetrics');
        options.clip = { x: 0, y: 0, width: cssContentSize.width, height: cssContentSize.height, scale: 1 };
      }
      const shot = await send('Page.captureScreenshot', options);
      await fs.writeFile(path.join(process.env.SCREENSHOT_DIR, filename), Buffer.from(shot.data, 'base64'));
    };
    const reload = async () => {
      await send('Page.reload');
      await waitFor(page, `document.readyState === 'complete' && !window.__smoke`, 'Page did not reload');
      await ready(page);
    };
    await send('Page.enable');
    await send('Runtime.enable');
    await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1100, deviceScaleFactor: 1, mobile: false });
    await send('Page.navigate', { url });
    await ready(page);
    await evaluate('localStorage.clear(); true');
    await reload();
    await check('Page recommends accessibility paths without room navigation', `(() => {
      document.getElementById('recommendButton').click();
      return !document.getElementById('destinationSelect') && !document.getElementById('originSelect')
        && __smoke.cards().length > 0 && document.querySelectorAll('#buildingMap polyline[data-map-path]').length > 0;
    })()`);
    await check('Styles, scripts and event handlers remain separate', `!document.querySelector('[onclick], style, script:not([src])')`);
    await check('Wheelchair recommendations respect slippery-surface complaints', `(() => {
      __smoke.select('buildingSelect', 'campus'); __smoke.select('floorSelect', '1');
      __smoke.radio('need', 'wheelchair'); __smoke.text('complaintInput', '');
      document.getElementById('recommendButton').click();
      const initial = __smoke.cards();
      __smoke.text('complaintInput', 'licin'); document.getElementById('recommendButton').click();
      return initial.length > __smoke.cards().length && __smoke.cards().length > 0
        && appState.prefs.complaint === 'licin' && __smoke.cards().every(id => {
          const item = AksesinData.getPath(id); return item.supports.includes('wheelchair') && item.features.nonSlip;
        });
    })()`);
    await check('Switching access profile changes the compatible paths', `(() => {
      const wheelchair = __smoke.cards();
      __smoke.text('complaintInput', ''); __smoke.radio('need', 'blind');
      document.getElementById('recommendButton').click();
      return appState.prefs.need === 'blind' && __smoke.cards().length > 0
        && JSON.stringify(wheelchair) !== JSON.stringify(__smoke.cards())
        && __smoke.cards().every(id => AksesinData.getPath(id).supports.includes('blind'));
    })()`);
    await check('Unmet access requirements produce an empty recommendation list', `(() => {
      __smoke.text('complaintInput', 'gelap'); document.getElementById('recommendButton').click();
      return __smoke.cards().length === 0 && document.getElementById('pathCards').textContent.trim().length > 0;
    })()`);
    await check('Building and floor selections refresh the recommended paths', `(() => {
      __smoke.select('buildingSelect', 'hospital'); __smoke.select('floorSelect', '2');
      __smoke.radio('need', 'deaf'); __smoke.text('complaintInput', 'petunjuk visual');
      document.getElementById('recommendButton').click();
      return appState.prefs.need === 'deaf' && appState.prefs.building === 'hospital'
        && Number(appState.prefs.floor) === 2 && __smoke.cards().length > 0
        && __smoke.cards().every(id => { const item = AksesinData.getPath(id); return item.buildingId === 'hospital' && item.floor === 2; });
    })()`);
    const targetId = await evaluate(`(() => {
      __smoke.select('buildingSelect', 'campus'); __smoke.select('floorSelect', '1');
      __smoke.radio('need', 'wheelchair'); __smoke.text('complaintInput', 'licin');
      document.getElementById('recommendButton').click();
      const id = __smoke.cards()[0]; __smoke.save(id); document.getElementById('savedPathsTab').click(); return id;
    })()`);
    assert.ok(targetId, 'There must be a matching path to bookmark and report');
    const id = JSON.stringify(targetId);
    await check('Saved tab shows the bookmarked path', `appState.savedPathIds.includes(${id}) && __smoke.cards().includes(${id})`);
    await reload();
    await check('Bookmarks and profile preferences survive reload', `(() => {
      document.getElementById('savedPathsTab').click();
      return appState.savedPathIds.includes(${id}) && __smoke.cards().includes(${id})
        && document.getElementById('buildingSelect').value === 'campus' && document.getElementById('floorSelect').value === '1'
        && document.querySelector('input[name="need"]:checked').value === 'wheelchair'
        && document.getElementById('complaintInput').value === 'licin';
    })()`);
    await check('Path details open the correct report dialog', `(() => {
      document.getElementById('allPathsTab').click(); __smoke.detail(${id}); __smoke.openReport();
      return document.getElementById('reportDialog').open && document.getElementById('reportPath').value === ${id}
        && !!document.getElementById('reportPhoto');
    })()`);
    const reportsBefore = await evaluate('appState.reports.length');
    await evaluate(`__smoke.report('Penguji browser', 2, 'caution', ''); document.getElementById('reportComment').focus(); true`);
    await send('Input.insertText', { text: 'uji' });
    await check('Short comments fail validation without creating a report', `(() => {
      document.getElementById('submitReportButton').click();
      return document.getElementById('reportDialog').open && appState.reports.length === ${reportsBefore};
    })()`);
    const draft = JSON.stringify('Draf pemeriksaan permukaan ramp perlu ditinjau.');
    await evaluate(`__smoke.report('Penguji browser', 2, 'caution', ${draft}); true`);
    await send('DOM.enable');
    const { root: documentNode } = await send('DOM.getDocument');
    const { nodeId: photoInput } = await send('DOM.querySelector', { nodeId: documentNode.nodeId, selector: '#reportPhoto' });
    await send('DOM.setFileInputFiles', { nodeId: photoInput, files: [path.resolve(__dirname, '../assets/ramp.png')] });
    await waitFor(page, `AksesinData.validPhoto(appState.draft.photo)
      && document.getElementById('reportPhotoPreview').complete
      && document.getElementById('reportPhotoPreview').naturalWidth > 0`, 'Uploaded photo was not compressed and previewed');
    await check('Photo upload creates a valid compressed preview for local storage', `!document.getElementById('photoPreview').hidden
      && appState.draft.photo.length <= AksesinData.MAX_PHOTO_LENGTH
      && appState.draft.photo.startsWith('data:image/jpeg;base64,')`);
    await evaluate(`document.getElementById('closeReportButton').click(); true`);
    await reload();
    await check('Unfinished report drafts survive closing and reloading', `(() => {
      document.getElementById('allPathsTab').click(); __smoke.detail(${id}); __smoke.openReport();
      return document.getElementById('reportComment').value === ${draft}
        && document.getElementById('reportAuthor').value === 'Penguji browser'
        && document.querySelector('input[name="rating"]:checked')?.value === '2'
        && document.querySelector('input[name="condition"]:checked')?.value === 'caution'
        && AksesinData.validPhoto(appState.draft.photo) && !document.getElementById('photoPreview').hidden;
    })()`);
    const blockedComment = JSON.stringify('Ramp terhalang barang. <img src=x onerror="window.__aksesinXss = true">');
    await evaluate(`__smoke.report('Penguji browser', 1, 'blocked', ${blockedComment}); document.getElementById('submitReportButton').click(); true`);
    await waitFor(page, `appState.reports.length === ${reportsBefore + 1}`, 'Blocked report was not saved');
    await check('Blocked reports immediately remove a path from recommendations', `!__smoke.cards().includes(${id})
      && AksesinData.summarize(${id}, appState).condition === 'blocked' && !document.getElementById('reportDialog').open`);
    await check('The reported condition updates the visible map', `document.querySelector('#buildingMap polyline[data-map-path="' + ${id} + '"]').dataset.condition === 'blocked'`);
    await check('Forum renders submitted comments safely as literal text', `(() => {
      __smoke.select('forumPathFilter', ${id}); const feed = document.getElementById('forumFeed');
      return feed.textContent.includes(${blockedComment}) && !feed.querySelector('img[src="x"]') && !window.__aksesinXss;
    })()`);
    const blockedRating = await evaluate(`AksesinData.summarize(${id}, appState).rating`);
    const restoredComment = JSON.stringify('Jalur sudah bersih dan kembali dapat dilalui.');
    await evaluate(`__smoke.openReport(); __smoke.report('Penguji browser', 5, 'available', ${restoredComment});
      document.getElementById('submitReportButton').click(); true`);
    await waitFor(page, `appState.reports.length === ${reportsBefore + 2}`, 'Available report was not saved');
    await check('Available reports restore the path recommendation and map condition', `__smoke.cards().includes(${id})
      && AksesinData.summarize(${id}, appState).condition === 'available'
      && document.querySelector('#buildingMap polyline[data-map-path="' + ${id} + '"]').dataset.condition === 'available'`);
    await check('The average path rating incorporates newly submitted ratings', `AksesinData.summarize(${id}, appState).rating > ${blockedRating}`);
    await reload();
    await check('Forum comments, ratings and current conditions survive reload', `(() => {
      __smoke.select('forumPathFilter', ${id}); const feed = document.getElementById('forumFeed');
      return appState.reports.length === ${reportsBefore + 2}
        && appState.reports.some(report => report.comment === ${blockedComment} && report.rating === 1 && AksesinData.validPhoto(report.photo))
        && appState.reports.some(report => report.comment === ${restoredComment} && report.rating === 5)
        && feed.textContent.includes(${blockedComment}) && feed.textContent.includes(${restoredComment})
        && AksesinData.summarize(${id}, appState).condition === 'available';
    })()`);
    await check('Submitted photos persist in the forum and update the path card', `(() => {
      const photo = appState.reports.find(report => report.comment === ${blockedComment}).photo;
      const card = document.querySelector('#pathCards [data-card-path="' + ${id} + '"]');
      return [...document.querySelectorAll('#forumFeed .commentPhoto')].some(image => image.src === photo)
        && card.querySelector('.pathPhoto img').src === photo
        && card.textContent.includes('Foto komunitas');
    })()`);
    const { targetId: otherId } = await send('Target.createTarget', { url });
    const nextTabs = await fetch(`http://${origin.host}/json/list`).then(result => result.json());
    const other = await connect(nextTabs.find(tab => tab.id === otherId).webSocketDebuggerUrl, errors);
    clients.push(other); await other.send('Runtime.enable'); await ready(other);
    await evaluate(`document.getElementById('allPathsTab').click(); __smoke.save(${id}); true`);
    await waitFor(other, `!appState.savedPathIds.includes(${id})`, 'Bookmark removal did not synchronize to second tab');
    await evaluate(`__smoke.save(${id}); true`);
    await waitFor(other, `appState.savedPathIds.includes(${id})`, 'Bookmark addition did not synchronize to second tab');
    console.log('PASS Saved paths synchronize between two open tabs');
    await send('Target.closeTarget', { targetId: otherId }); other.socket.close();
    const unsavedComment = JSON.stringify('Laporan tetap terlihat saat penyimpanan perangkat penuh.');
    await check('Storage quota failures retain the report and show an unsaved warning', `(() => {
      const originalSetItem = Storage.prototype.setItem;
      Storage.prototype.setItem = function () { throw new DOMException('Test storage quota', 'QuotaExceededError'); };
      try {
        __smoke.detail(${id}); __smoke.openReport();
        __smoke.report('Penguji browser', 3, 'caution', ${unsavedComment});
        document.getElementById('submitReportButton').click();
        return appState.reports.some(report => report.comment === ${unsavedComment})
          && document.getElementById('forumFeed').textContent.includes(${unsavedComment})
          && document.getElementById('storageIndicator').classList.contains('error')
          && document.getElementById('toast').textContent.includes('belum tersimpan')
          && !AksesinData.loadState().state.reports.some(report => report.comment === ${unsavedComment});
      } finally { Storage.prototype.setItem = originalSetItem; }
    })()`);
    await check('An in-memory report saves successfully after storage recovers', `(() => {
      __smoke.save(${id});
      return !document.getElementById('storageIndicator').classList.contains('error')
        && AksesinData.loadState().state.reports.some(report => report.comment === ${unsavedComment});
    })()`);
    await check('Desktop has no horizontal overflow', 'document.documentElement.scrollWidth <= innerWidth');
    if (process.env.SCREENSHOT_DIR) {
      // All persistence assertions are complete; show clean demo content in previews.
      // This state belongs exclusively to this test's temporary browser profile.
      await evaluate('appState = AksesinData.defaultState(); localStorage.clear(); true');
      await reload();
    }
    await capture('aksesin-desktop.png', '#buildingMap');
    await capture('aksesin-overview.png', 'body', true);
    await capture('aksesin-community.png', '#community');
    for (const width of [390, 320]) {
      await send('Emulation.setDeviceMetricsOverride', { width, height: 844, deviceScaleFactor: 1, mobile: true });
      await check(`Mobile layout fits a ${width}px viewport`, 'document.documentElement.scrollWidth <= innerWidth');
      await check(`Saved-data export remains visible at ${width}px`, `(() => {
        const button = document.getElementById('exportFooterButton');
        return !!button && button.getBoundingClientRect().width > 0 && getComputedStyle(button).visibility !== 'hidden';
      })()`);
      await check(`Path details and reporting work at ${width}px`, `(() => {
        document.getElementById('allPathsTab').click(); __smoke.detail(${id}); __smoke.openReport();
        const dialog = document.getElementById('reportDialog'); const bounds = dialog.getBoundingClientRect();
        const fits = dialog.open && bounds.left >= 0 && bounds.right <= innerWidth + 1;
        document.getElementById('closeReportButton').click(); return fits;
      })()`);
    }
    if (process.env.SCREENSHOT_DIR) {
      await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
      await capture('aksesin-mobile.png', '#buildingMap');
    }
    assert.deepEqual(errors, [], 'Page must not emit JavaScript errors');
    console.log('PASS No browser JavaScript errors');
    await send('Browser.close').catch(() => {});
  } finally {
    for (const client of clients) client.socket.close();
    if (browser.exitCode === null) browser.kill();
    if (browser.exitCode === null) await new Promise(resolve => browser.once('exit', resolve));
    await new Promise(resolve => server.close(resolve));
    // Remove only the unique temporary browser profile allocated by this test.
    const resolved = path.resolve(profile);
    assert.equal(path.dirname(resolved), path.resolve(os.tmpdir()));
    assert.ok(path.basename(resolved).startsWith('aksesin-browser-test-'));
    await fs.rm(resolved, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
