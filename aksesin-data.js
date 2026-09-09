(function (root) {
  "use strict";

  const VERSION = 1;
  const STORAGE_KEY = "aksesin:v1";
  const MAX_PHOTO_LENGTH = 350000;
  const MAX_REPORTS = 150;
  const MIN_COMMENT_LENGTH = 10;
  const MAX_COMMENT_LENGTH = 1000;
  const CONDITION_LABELS = { available: "Bisa digunakan", caution: "Perlu perhatian", blocked: "Tidak bisa dilalui" };
  const NEEDS = [
    { id: "wheelchair", label: "Pengguna kursi roda", icon: "wheelchair", description: "Jalur tanpa tangga dengan ruang gerak yang cukup." },
    { id: "blind", label: "Tunanetra", icon: "eye", description: "Jalur dengan ubin pemandu yang tersambung." },
    { id: "deaf", label: "Tuli / sulit mendengar", icon: "ear", description: "Jalur dengan petunjuk dan informasi visual." }
  ];
  const BUILDINGS = [
    { id: "campus", name: "Kampus Inklusif Medan", shortName: "Kampus", address: "Area pendidikan · lokasi contoh" },
    { id: "hospital", name: "RS Harapan Sehat", shortName: "Rumah sakit", address: "Area layanan kesehatan · lokasi contoh" }
  ];
  const FEATURE_LABELS = {
    stepFree: "Tanpa tangga", tactile: "Ubin pemandu", wide: "Koridor lebar",
    lit: "Penerangan baik", nonSlip: "Permukaan antiselip", visualSigns: "Petunjuk visual"
  };
  const REQUIREMENT_REASONS = {
    stepFree: "Menghindari tangga sesuai keluhanmu.",
    wide: "Menyediakan ruang gerak yang lebih lebar.",
    nonSlip: "Memiliki permukaan antiselip sesuai kebutuhanmu.",
    lit: "Memiliki pencahayaan yang baik.",
    tactile: "Memiliki ubin pemandu untuk membantu orientasi.",
    visualSigns: "Informasi arah tersedia secara visual."
  };
  const NEED_REASONS = {
    wheelchair: "Jalur tanpa tangga dengan ruang gerak untuk kursi roda.",
    blind: "Ubin pemandu membantu mengenali jalur.",
    deaf: "Petunjuk visual membantu mengenali jalur."
  };

  const points = coordinates => coordinates.map(([x, y]) => ({ x, y }));
  function makePath(buildingId, floor, key, name, location, description, supports, features, coordinates, image, condition = "available") {
    return {
      id: `${buildingId}-${key}`, buildingId, floor, name, location, description, supports,
      features: { stepFree: false, tactile: false, wide: false, lit: false, nonSlip: false, visualSigns: false, ...features },
      featureLabels: Object.keys(FEATURE_LABELS).filter(feature => features[feature]).map(feature => FEATURE_LABELS[feature]),
      points: points(coordinates), image: `assets/${image}.png`,
      imageAlt: image === "ramp" ? "Ilustrasi ramp dengan pegangan tangan dan permukaan antiselip"
        : image === "tactile" ? "Ilustrasi ubin pemandu pada jalur pejalan kaki"
          : "Ilustrasi koridor yang lapang dengan petunjuk visual",
      imageCaption: "Gambar ilustrasi · bukan dokumentasi lokasi asli", condition,
      updatedAt: "2026-09-09T04:00:00.000Z", demo: true
    };
  }

  // These polylines are corridor segments, never room destinations. Coordinates
  // share the demonstration floor plan in aksesin-routing.js (percent units).
  const PATHS = BUILDINGS.flatMap(building => {
    const campus = building.id === "campus";
    const lowerY = campus ? 67.5 : 70.5;
    const middleY = campus ? 35.5 : 37.5;
    const areaName = campus ? "area terbuka" : "area tunggu terbuka";
    return [
      makePath(building.id, 1, "ramp", "Jalur ramp utama", "Sisi selatan · lantai 1",
        `Jalur landai di tepi ${areaName}, dengan pegangan tangan dan permukaan antiselip. Cocok untuk mengakses sirkulasi lantai dasar tanpa tangga.`,
        ["wheelchair", "deaf"], { stepFree: true, wide: true, lit: true, nonSlip: true, visualSigns: true },
        [[96.5, lowerY], [9, lowerY], [9, 81]], "ramp"),
      makePath(building.id, 1, "tactile", "Jalur ubin pemandu", "Koridor barat · lantai 1",
        "Ubin pemandu tersambung dari area terbuka melewati koridor barat. Jalur contoh ini memiliki bagian sempit dan pencahayaan terbatas; cek laporan kondisi sebelum menggunakan.",
        ["blind"], { stepFree: true, tactile: true, nonSlip: true },
        [[9, 81], [33.5, 81], [33.5, middleY], [60, middleY]], "tactile", "caution"),
      makePath(building.id, 1, "visual", "Koridor petunjuk visual", "Sisi timur · lantai 1",
        "Koridor tanpa tangga dengan penanda arah kontras dan informasi visual. Permukaannya belum dilengkapi lapisan antiselip; berhati-hati jika jalur basah.",
        ["wheelchair", "deaf"], { stepFree: true, wide: true, lit: true, visualSigns: true },
        [[96.5, lowerY], [96.5, middleY], [63.5, middleY]], "corridor", "caution"),
      makePath(building.id, 2, "gallery", "Koridor akses bersama", "Koridor tengah · lantai 2",
        "Segmen koridor lebar dengan ubin pemandu, petunjuk visual, dan permukaan antiselip. Akses antar lantai menggunakan lift; periksa kondisi lift secara terpisah di lokasi.",
        ["wheelchair", "blind", "deaf"], { stepFree: true, tactile: true, wide: true, lit: true, nonSlip: true, visualSigns: true },
        [[9, 39], [65, 39], [65, 89], [75, 89]], "corridor"),
      makePath(building.id, 2, "maintenance", "Jalur sisi timur", "Sisi timur · lantai 2",
        "Segmen jalur dengan ubin pemandu dan petunjuk visual. Pada data contoh terbaru, jalur ditutup sementara karena perbaikan permukaan.",
        ["wheelchair", "blind", "deaf"], { stepFree: true, tactile: true, wide: true, lit: true, nonSlip: true, visualSigns: true },
        [[73, 39], [96.5, 39], [96.5, 90], [84, 90]], "tactile", "blocked")
    ];
  });

  const SEED_REPORTS = PATHS.map((path, index) => ({
    id: `demo-${path.id}`, pathId: path.id, author: ["Dina", "Bima", "Naya"][index % 3],
    need: path.supports[0], rating: path.condition === "blocked" ? 2 : path.condition === "caution" ? 3 : index % 2 ? 5 : 4,
    condition: path.condition,
    comment: path.condition === "blocked" ? "Contoh laporan: jalur sedang diperbaiki dan belum bisa dilalui. Gunakan koridor akses bersama."
      : path.id.endsWith("tactile") ? "Contoh laporan: ubin pemandu tersambung, tetapi sebagian koridor sempit dan agak gelap."
        : path.id.endsWith("visual") ? "Contoh laporan: jalur lebar dan tanda arah jelas. Permukaan dapat terasa licin saat basah; perlu perhatian."
        : path.id.endsWith("ramp") ? "Contoh laporan: ramp dapat dilalui, pegangan tangan tersedia, dan jalur tidak terhalang."
          : path.id.endsWith("gallery") ? "Contoh laporan: koridor lapang, ubin pemandu tersambung, dan tanda arah terlihat jelas."
            : "Contoh laporan: petunjuk visual terlihat jelas.",
    createdAt: `2026-09-09T0${5 + index % 3}:00:00.000Z`, photo: "", demo: true
  }));

  const isObject = value => value !== null && typeof value === "object" && !Array.isArray(value);
  const validNeed = value => NEEDS.some(need => need.id === value);
  const validCondition = value => Object.hasOwn(CONDITION_LABELS, value);
  const getPath = id => PATHS.find(path => path.id === id) || null;
  function cleanText(value, length) {
    return typeof value === "string" ? value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").trim().slice(0, length) : "";
  }
  function validPhoto(value) {
    return typeof value === "string" && value.length <= MAX_PHOTO_LENGTH
      && /^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(value);
  }
  function cleanDate(value) {
    if (typeof value !== "string" || !/^\d{4}-\d\d-\d\dT/.test(value)) return "";
    const timestamp = Date.parse(value);
    if (!Number.isFinite(timestamp) || timestamp < Date.UTC(2000, 0, 1) || timestamp > Date.now() + 300000) return "";
    return new Date(timestamp).toISOString();
  }
  function defaultState() {
    return {
      version: VERSION,
      prefs: { building: "campus", need: "wheelchair", complaint: "", floor: 1 },
      savedPathIds: [], reports: [],
      draft: { pathId: "", author: "", need: "wheelchair", rating: 0, condition: "available", comment: "", photo: "" }
    };
  }
  function sanitizeReport(raw) {
    if (!isObject(raw) || !getPath(raw.pathId) || !validNeed(raw.need) || !validCondition(raw.condition)
      || !Number.isInteger(raw.rating) || raw.rating < 1 || raw.rating > 5) return null;
    const id = cleanText(raw.id, 100);
    const author = cleanText(raw.author, 50);
    const comment = cleanText(raw.comment, MAX_COMMENT_LENGTH);
    const createdAt = cleanDate(raw.createdAt);
    if (!id || id.startsWith("demo-") || !author || comment.length < MIN_COMMENT_LENGTH || !createdAt) return null;
    return {
      id, pathId: raw.pathId, author, need: raw.need, rating: raw.rating,
      condition: raw.condition, comment, createdAt, photo: validPhoto(raw.photo) ? raw.photo : "", demo: false
    };
  }
  function sanitizeState(raw) {
    const state = defaultState();
    if (!isObject(raw) || raw.version !== VERSION) return state;
    const prefs = isObject(raw.prefs) ? raw.prefs : {};
    state.prefs = {
      building: BUILDINGS.some(building => building.id === prefs.building) ? prefs.building : "campus",
      need: validNeed(prefs.need) ? prefs.need : "wheelchair",
      complaint: cleanText(prefs.complaint, 500), floor: [1, 2].includes(prefs.floor) ? prefs.floor : 1
    };
    if (Array.isArray(raw.savedPathIds)) state.savedPathIds = [...new Set(raw.savedPathIds.filter(id => getPath(id)))];
    if (Array.isArray(raw.reports)) {
      const unique = new Map();
      for (const value of raw.reports) {
        const report = sanitizeReport(value);
        if (report && !unique.has(report.id)) unique.set(report.id, report);
      }
      // Stable sorting preserves prepend order when submissions share a millisecond.
      state.reports = [...unique.values()].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)).slice(0, MAX_REPORTS);
    }
    if (isObject(raw.draft)) {
      const draft = raw.draft;
      state.draft = {
        pathId: getPath(draft.pathId) ? draft.pathId : "", author: cleanText(draft.author, 50),
        need: validNeed(draft.need) ? draft.need : state.prefs.need,
        rating: Number.isInteger(draft.rating) && draft.rating >= 0 && draft.rating <= 5 ? draft.rating : 0,
        condition: validCondition(draft.condition) ? draft.condition : "available",
        comment: cleanText(draft.comment, MAX_COMMENT_LENGTH), photo: validPhoto(draft.photo) ? draft.photo : ""
      };
    }
    return state;
  }
  function loadState(storage) {
    try {
      const local = storage === undefined ? root.localStorage : storage;
      if (!local || typeof local.getItem !== "function") throw new Error("storage-unavailable");
      const serialized = local.getItem(STORAGE_KEY);
      if (!serialized) return { state: defaultState(), saved: true, error: null };
      const parsed = JSON.parse(serialized);
      if (!isObject(parsed) || parsed.version !== VERSION) return { state: defaultState(), saved: false, error: "invalid-data" };
      return { state: sanitizeState(parsed), saved: true, error: null };
    } catch (error) {
      return { state: defaultState(), saved: false, error: error instanceof SyntaxError ? "invalid-data" : "storage-unavailable" };
    }
  }
  function saveState(raw, storage) {
    const state = sanitizeState(raw);
    try {
      const local = storage === undefined ? root.localStorage : storage;
      if (!local || typeof local.setItem !== "function") throw new Error("storage-unavailable");
      local.setItem(STORAGE_KEY, JSON.stringify(state));
      return { state, saved: true, error: null };
    } catch (error) {
      return { state, saved: false, error: error && (error.name === "QuotaExceededError" || error.code === 22 || error.code === 1014) ? "storage-full" : "storage-unavailable" };
    }
  }
  function getReports(state, pathId) {
    return [...sanitizeState(state).reports, ...SEED_REPORTS.map(report => ({ ...report }))]
      .filter(report => !pathId || report.pathId === pathId)
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  }
  function summarize(pathId, state) {
    const path = getPath(pathId);
    if (!path) return null;
    const reports = getReports(state, pathId);
    const latestReport = reports[0] || null;
    return {
      condition: latestReport ? latestReport.condition : path.condition,
      rating: reports.length ? Math.round(reports.reduce((sum, report) => sum + report.rating, 0) / reports.length * 10) / 10 : null,
      count: reports.length,
      lastUpdated: latestReport ? latestReport.createdAt : path.updatedAt,
      latestReport
    };
  }
  function parseComplaint(value) {
    const complaint = cleanText(value, 500).normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    const patterns = [
      ["stepFree", /\b(tangga|undakan|berundak|step)\b/],
      ["wide", /\b(sempit|lebar|berpapasan)\b/],
      ["nonSlip", /\b(licin|basah|tergelincir|antiselip)\b/],
      ["lit", /\b(gelap|penerangan|pencahayaan)\b|(?:kurang|minim)\s+cahaya/],
      ["tactile", /\b(pemandu|penuntun|taktil|tactile)\b|ubin\s+pengarah|guiding\s+block/],
      ["visualSigns", /\b(rambu|visual)\b|tanda\s+arah/]
    ];
    return patterns.filter(([, pattern]) => pattern.test(complaint)).map(([feature]) => feature);
  }
  function recommend(raw, options = {}) {
    const state = sanitizeState(raw);
    const requirements = parseComplaint(state.prefs.complaint);
    return PATHS.filter(path => path.buildingId === state.prefs.building
      && (options.floor === undefined || path.floor === options.floor)
      && path.supports.includes(state.prefs.need)
      && requirements.every(feature => path.features[feature]))
      .map(path => ({
        ...path, summary: summarize(path.id, state),
        reasons: [NEED_REASONS[state.prefs.need], ...requirements.map(feature => REQUIREMENT_REASONS[feature])]
      }))
      .filter(path => path.summary.condition !== "blocked")
      .sort((a, b) => (a.summary.condition === "caution") - (b.summary.condition === "caution")
        || a.supports.length - b.supports.length || (b.summary.rating || 0) - (a.summary.rating || 0));
  }
  function createReport(values) {
    const raw = isObject(values) ? values : {};
    const errors = {};
    const author = cleanText(raw.author, 50);
    const comment = cleanText(raw.comment, MAX_COMMENT_LENGTH + 1);
    if (!getPath(raw.pathId)) errors.pathId = "Pilih jalur yang ingin dilaporkan.";
    if (!author) errors.author = "Isi nama atau nama panggilanmu.";
    if (!validNeed(raw.need)) errors.need = "Pilih kebutuhan aksesmu.";
    if (!Number.isInteger(raw.rating) || raw.rating < 1 || raw.rating > 5) errors.rating = "Pilih rating 1 sampai 5.";
    if (!validCondition(raw.condition)) errors.condition = "Pilih kondisi jalur saat ini.";
    if (comment.length < MIN_COMMENT_LENGTH) errors.comment = "Tulis komentar setidaknya 10 karakter.";
    if (comment.length > MAX_COMMENT_LENGTH) errors.comment = "Komentar maksimal 1.000 karakter.";
    if (raw.photo && !validPhoto(raw.photo)) errors.photo = "Foto harus berupa JPG, PNG, atau WebP berukuran kecil.";
    if (Object.keys(errors).length) return { report: null, errors };
    const id = root.crypto && typeof root.crypto.randomUUID === "function" ? root.crypto.randomUUID()
      : `report-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    return {
      report: { id, pathId: raw.pathId, author, need: raw.need, rating: raw.rating, condition: raw.condition,
        comment, createdAt: new Date().toISOString(), photo: raw.photo || "", demo: false },
      errors: {}
    };
  }
  function addReport(raw, values) {
    const state = sanitizeState(raw);
    const result = createReport(values);
    if (!result.report) return { state, ...result };
    state.reports.unshift(result.report);
    state.reports = state.reports.slice(0, MAX_REPORTS);
    state.draft = { ...defaultState().draft, author: result.report.author, need: state.prefs.need };
    return { state, ...result };
  }

  const api = {
    VERSION, STORAGE_KEY, MAX_PHOTO_LENGTH, MAX_REPORTS, MIN_COMMENT_LENGTH, MAX_COMMENT_LENGTH, CONDITION_LABELS, BUILDINGS, NEEDS, PATHS,
    FEATURE_LABELS, SEED_REPORTS, getPath, defaultState, sanitizeState, loadState, saveState,
    getReports, summarize, parseComplaint, recommend, createReport, addReport, validPhoto
  };
  root.AksesinData = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(globalThis);
