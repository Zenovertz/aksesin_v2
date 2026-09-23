(function (root) {
  'use strict';

  // Keep provider setup here; application code only passes mall and GPS data.
  const BASE = 'https://cesium.com/downloads/cesiumjs/releases/1.145/Build/Cesium/';
  let libraryPromise;

  function loadLibrary() {
    if (libraryPromise) return libraryPromise;
    root.CESIUM_BASE_URL = BASE;
    libraryPromise = Promise.allSettled([
      loadAsset('link', 'cesium-vendor-style', BASE + 'Widgets/widgets.css'),
      root.Cesium ? Promise.resolve() : loadAsset('script', 'cesium-vendor-script', BASE + 'Cesium.js')
    ]).then(results => {
      if (results.some(result => result.status === 'rejected') || !root.Cesium) throw new Error('Cesium unavailable');
      return root.Cesium;
    }).catch(error => { libraryPromise = null; throw error; });
    return libraryPromise;
  }

  function loadAsset(tag, id, url) {
    const old = document.getElementById(id);
    if (old?.dataset.loaded === 'true') return Promise.resolve();
    old?.remove();
    return new Promise((resolve, reject) => {
      const element = document.createElement(tag); element.id = id;
      if (tag === 'link') { element.rel = 'stylesheet'; element.href = url; }
      else { element.src = url; element.async = true; }
      const timer = setTimeout(() => finish(false), 20000);
      function finish(ok) {
        clearTimeout(timer); element.onload = null; element.onerror = null;
        if (ok) { element.dataset.loaded = 'true'; resolve(); }
        else { element.remove(); reject(new Error('Map library unavailable')); }
      }
      element.onload = () => finish(true); element.onerror = () => finish(false);
      document.head.append(element);
    });
  }

  async function getConfig() {
    const defaults = { ionAccessToken: null, enable3d: false };
    if (!['http:', 'https:'].includes(location.protocol)) return defaults;
    try {
      const response = await fetch('/api/config/maps', { signal: AbortSignal.timeout(4000) });
      if (!response.ok) return defaults;
      const value = await response.json();
      const token = typeof value.ionAccessToken === 'string' && value.ionAccessToken.length <= 4096
        && !/[\u0000-\u001f\u007f-\u009f]/.test(value.ionAccessToken) ? value.ionAccessToken.trim() : '';
      return { ionAccessToken: token || null, enable3d: Boolean(token) && value.enable3d === true };
    } catch { return defaults; }
  }

  function create({ onLocate }) {
    const $ = id => document.getElementById(id);
    const viewport = $('cesiumViewport');
    let viewer = null, C = null, mall = null, point = null, loading = false, generation = 0;
    let removeRenderError = null;
    const status = (message, error = false) => {
      $('cesiumMapStatus').textContent = message;
      $('cesiumMapStatus').dataset.state = error ? 'error' : 'ready';
    };
    const render = () => viewer?.scene.requestRender();

    function focus(position = mall) {
      if (!viewer || !position) return;
      viewer.camera.flyTo({
        destination: C.Cartesian3.fromDegrees(position.lon, position.lat, 950),
        orientation: { heading: 0, pitch: C.Math.toRadians(-90), roll: 0 },
        duration: root.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 0.8
      });
    }

    function setMall(value) {
      mall = value;
      if (!viewer) return;
      root.AksesinMalls.MALLS.forEach(item => {
        const entity = viewer.entities.getById('mall-' + item.id);
        if (entity) entity.point.pixelSize = item.id === mall.id ? 15 : 10;
      });
      focus(); render();
    }

    function clearLocation() {
      point = null;
      if (!viewer) return;
      viewer.entities.removeById('device-location');
      viewer.entities.removeById('device-accuracy'); render();
    }

    function setLocation(value) {
      clearLocation();
      if (!value || !Number.isFinite(value.lat) || !Number.isFinite(value.lon)
        || !Number.isFinite(value.accuracy) || value.accuracy <= 0 || value.accuracy > 150) return;
      point = { lat: value.lat, lon: value.lon, accuracy: value.accuracy };
      if (!viewer) return;
      const position = C.Cartesian3.fromDegrees(point.lon, point.lat);
      viewer.entities.add({ id: 'device-accuracy', position,
        ellipse: { semiMajorAxis: point.accuracy, semiMinorAxis: point.accuracy,
          material: C.Color.fromCssColorString('#3186ce').withAlpha(0.2) } });
      viewer.entities.add({ id: 'device-location', name: 'Perkiraan lokasi perangkat', position,
        point: { pixelSize: 12, color: C.Color.fromCssColorString('#3186ce'), outlineColor: C.Color.WHITE,
          outlineWidth: 3, heightReference: C.HeightReference.CLAMP_TO_GROUND, disableDepthTestDistance: Number.POSITIVE_INFINITY },
        label: { text: `Perkiraan ±${Math.ceil(point.accuracy)} m`, font: '12px sans-serif',
          pixelOffset: new C.Cartesian2(0, -27), fillColor: C.Color.WHITE,
          showBackground: true, backgroundColor: C.Color.fromCssColorString('#244657'),
          heightReference: C.HeightReference.CLAMP_TO_GROUND, disableDepthTestDistance: Number.POSITIVE_INFINITY }
      });
      focus(point); render();
    }

    function destroyViewer() {
      generation++; removeRenderError?.(); removeRenderError = null;
      if (viewer && !viewer.isDestroyed()) viewer.destroy();
      viewer = null; viewport.replaceChildren(); viewport.hidden = true;
      $('cesiumToolbar').hidden = true;
    }

    function failed() {
      destroyViewer();
      status('Peta belum dapat ditampilkan. Periksa koneksi dan dukungan WebGL browser, lalu coba lagi. Informasi fasilitas tetap tersedia.', true);
      $('loadCesiumMap').hidden = false; $('loadCesiumMap').disabled = false;
      $('loadCesiumMap').textContent = 'Coba buka peta lagi';
    }

    async function addIonLayers(instance, version) {
      status('Peta area aktif. Memuat terrain dan bangunan 3D…');
      let finished = 0, successful = 0;
      const timer = setTimeout(() => {
        if (version === generation) status('Peta area aktif. Lapisan 3D masih menunggu koneksi; detail bangunan bergantung pada cakupan data.');
      }, 12000);
      async function add(kind, promise) {
        try {
          const asset = await promise;
          if (version !== generation || instance.isDestroyed()) { asset.destroy?.(); return; }
          if (kind === 'terrain') instance.terrainProvider = asset;
          else instance.scene.primitives.add(asset);
          successful++; render();
        } catch { /* The OSM base map remains usable when ion is unavailable. */ }
        finally {
          if (++finished === 2) {
            clearTimeout(timer);
            if (version === generation) status(successful === 2
              ? 'Terrain dan bangunan 3D aktif. Detail bangunan mengikuti cakupan data Cesium.'
              : 'Peta area aktif. Sebagian lapisan 3D belum tersedia; periksa token dan akses aset Cesium.');
          }
        }
      }
      await Promise.allSettled([
        add('terrain', C.createWorldTerrainAsync()),
        add('buildings', C.createOsmBuildingsAsync())
      ]);
    }

    async function load() {
      if (loading || viewer) return;
      loading = true; $('loadCesiumMap').disabled = true;
      status('Memuat peta Cesium…');
      const version = ++generation;
      try {
        const [library, config] = await Promise.all([loadLibrary(), getConfig()]);
        if (version !== generation) return;
        C = library;
        // Never fall back to the demonstration ion token bundled with CesiumJS.
        C.Ion.defaultAccessToken = config.ionAccessToken || '';
        viewport.hidden = false;
        const imagery = new C.OpenStreetMapImageryProvider({
          url: 'https://tile.openstreetmap.org/',
          credit: new C.Credit('© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap contributors</a>', true)
        });
        viewer = new C.Viewer(viewport, {
          baseLayer: new C.ImageryLayer(imagery), terrainProvider: new C.EllipsoidTerrainProvider(),
          geocoder: false, homeButton: false, baseLayerPicker: false, sceneModePicker: false,
          navigationHelpButton: false, fullscreenButton: false, timeline: false, animation: false,
          infoBox: false, selectionIndicator: false, requestRenderMode: true,
          maximumRenderTimeChange: Infinity, showRenderLoopErrors: false
        });
        removeRenderError = viewer.scene.renderError.addEventListener(() => queueMicrotask(failed));
        root.AksesinMalls.MALLS.forEach(item => viewer.entities.add({
          id: 'mall-' + item.id, name: 'Area ' + item.name,
          position: C.Cartesian3.fromDegrees(item.lon, item.lat),
          point: { pixelSize: item.id === mall?.id ? 15 : 10, color: C.Color.fromCssColorString('#176b52'),
            outlineColor: C.Color.WHITE, outlineWidth: 3, heightReference: C.HeightReference.CLAMP_TO_GROUND,
            disableDepthTestDistance: Number.POSITIVE_INFINITY },
          label: { text: 'Area ' + item.shortName, font: '13px sans-serif',
            pixelOffset: new C.Cartesian2(0, -28), fillColor: C.Color.WHITE,
            showBackground: true, backgroundColor: C.Color.fromCssColorString('#244637'),
            heightReference: C.HeightReference.CLAMP_TO_GROUND, disableDepthTestDistance: Number.POSITIVE_INFINITY }
        }));
        focus(); if (point) setLocation(point);
        $('cesiumToolbar').hidden = false; $('loadCesiumMap').hidden = true;
        status('Peta area aktif · Cesium + OpenStreetMap. Titik mall menunjukkan perkiraan area bangunan.');
        if (config.enable3d) void addIonLayers(viewer, version);
      } catch { if (version === generation) failed(); }
      finally { loading = false; $('loadCesiumMap').disabled = false; }
    }

    $('loadCesiumMap').addEventListener('click', load);
    $('cesiumResetView').addEventListener('click', () => focus());
    $('cesiumLocateButton').addEventListener('click', () => {
      $('gpsDetails').open = true; onLocate(); $('locationStatus').scrollIntoView({ block: 'nearest' });
    });
    // pagehide may enter the back-forward cache; allow the map to be opened again.
    root.addEventListener('pagehide', () => {
      destroyViewer(); loading = false; point = null;
      $('loadCesiumMap').hidden = false; $('loadCesiumMap').disabled = false;
      status('Buka peta untuk melihat area mall.');
    });
    return { load, setMall, setLocation, clearLocation };
  }

  root.AksesinCesiumMap = { create };
})(globalThis);
