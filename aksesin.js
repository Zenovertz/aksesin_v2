

"use strict";

const D = globalThis.AksesinData;
const $ = id => document.getElementById(id);
const initialData = D.loadState();
let appState = initialData.state;
let activeView = "all";
let selectedPathId = "";
let forumFilter = "";
let toastTimer;
let complaintTimer;
let photoVersion = 0;
let processingPhoto = false;
let storageHealthy = initialData.saved;

const escapeHTML = value => String(value ?? "").replace(/[&<>"']/g, character => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
})[character]);
const icon = name => `<svg class="icon" aria-hidden="true"><use href="#i-${name}"/></svg>`;
const buildingName = id => D.BUILDINGS.find(item => item.id === id)?.name || "";
const needName = id => D.NEEDS.find(item => item.id === id)?.label || "";
const summaryFor = path => D.summarize(path.id, appState);
const badge = condition => `<span class="conditionBadge ${condition}"><span class="statusDot ${condition}"></span>${D.CONDITION_LABELS[condition]}</span>`;
const rating = (value, count) => `<span class="ratingSummary" aria-label="Rating ${value ?? 0} dari 5${count === undefined ? "" : `, ${count} ulasan`}">${icon("star")}${value === null ? "—" : Number(value).toFixed(1)}${count === undefined ? "" : `<small>(${count})</small>`}</span>`;

function timeLabel(value) {
  const elapsed = Date.now() - Date.parse(value);
  if (elapsed >= 0 && elapsed < 60000) return "Baru saja";
  if (elapsed >= 0 && elapsed < 3600000) return `${Math.floor(elapsed / 60000)} menit lalu`;
  if (elapsed >= 0 && elapsed < 86400000) return `${Math.floor(elapsed / 3600000)} jam lalu`;
  return new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "numeric" }).format(new Date(value));
}

function storageFeedback(saved, error) {
  storageHealthy = saved;
  const message = saved ? "Tersimpan di perangkat" : "Belum tersimpan";
  $("storageIndicator").innerHTML = `<span class="statusDot"></span>${message}`;
  $("storageIndicator").classList.toggle("error", !saved);
  $("storageIndicator").title = saved ? "Preferensi, favorit, draf, dan laporan tersimpan di browser ini."
    : error === "storage-full" ? "Penyimpanan browser penuh. Data masih tersedia di halaman ini; unduh data untuk menyimpannya."
      : "Penyimpanan browser tidak tersedia atau data sebelumnya tidak terbaca. Data baru tetap tersedia selama halaman terbuka.";
  $("draftStatus").innerHTML = icon(saved ? "check" : "alert") + (saved
    ? "Draf disimpan otomatis di perangkat ini" : "Draf belum tersimpan; jangan tutup halaman ini");
}

function persist() {
  // Keep reports submitted in another tab even if its storage event has not
  // reached this tab yet. Preferences and the open draft belong to this edit.
  const latest = D.loadState();
  if (latest.saved) {
    appState.reports = [...new Map([...appState.reports, ...latest.state.reports]
      .map(report => [report.id, report])).values()];
  }
  const result = D.saveState(appState);
  appState = result.state;
  storageFeedback(result.saved, result.error);
  return result.saved;
}

function toast(message) {
  clearTimeout(toastTimer);
  $("toast").textContent = message;
  $("toast").classList.add("show");
  toastTimer = setTimeout(() => $("toast").classList.remove("show"), 4200);
}

function syncPreferenceControls() {
  $("buildingSelect").value = appState.prefs.building;
  $("floorSelect").value = String(appState.prefs.floor);
  $("complaintInput").value = appState.prefs.complaint;
  document.querySelectorAll('input[name="need"]').forEach(input => { input.checked = input.value === appState.prefs.need; });
}

function qualifyingPaths() {
  const requirements = D.parseComplaint(appState.prefs.complaint);
  return D.PATHS.filter(path => path.buildingId === appState.prefs.building && path.floor === appState.prefs.floor
    && path.supports.includes(appState.prefs.need) && requirements.every(feature => path.features[feature]));
}

function renderCards(paths) {
  $("pathCards").innerHTML = paths.length ? paths.map(path => {
    const summary = path.summary || summaryFor(path);
    const saved = appState.savedPathIds.includes(path.id);
    const photoReport = D.getReports(appState, path.id).find(report => report.photo);
    const image = photoReport?.photo || path.image;
    return `<article class="pathCard${path.id === selectedPathId ? " selected" : ""}" data-card-path="${path.id}" data-condition="${summary.condition}">
      <div class="pathPhoto"><img src="${escapeHTML(image)}" alt="${escapeHTML(photoReport ? `Foto kondisi ${path.name} dari ${photoReport.author}` : path.imageAlt)}" loading="lazy">
        ${badge(summary.condition)}<button type="button" class="saveButton" data-save="${path.id}" aria-pressed="${saved}" aria-label="${saved ? "Hapus simpanan" : "Simpan"} ${escapeHTML(path.name)}">${icon("save")}</button>
        <span class="imageDisclosure">${photoReport ? "Foto komunitas" : "Ilustrasi jalur"}</span></div>
      <div class="pathCardBody"><div class="pathTitleRow"><h3>${escapeHTML(path.name)}</h3>${rating(summary.rating, summary.count)}</div>
        <p class="pathLocation">${icon("pin")}${escapeHTML(path.location)}</p>
        <p class="pathDescription">${escapeHTML(path.description)}</p>
        <div class="featureTags">${path.featureLabels.slice(0, 3).map(feature => `<span class="featureTag">${icon("check")}${escapeHTML(feature)}</span>`).join("")}</div>
        <p class="matchReason">${icon(summary.condition === "blocked" ? "alert" : "shield")}${escapeHTML(summary.condition === "blocked"
          ? "Sedang tidak bisa digunakan. Lihat laporan terbaru."
          : path.reasons?.at(-1) || (path.supports.includes(appState.prefs.need) ? "Tersimpan untuk kamu cek kembali saat dibutuhkan." : "Jalur tersimpan ini tidak sesuai dengan profil akses yang sedang dipilih."))}</p>
        <div class="pathCardFoot"><span class="updatedText">${icon("clock")}Diperbarui ${escapeHTML(timeLabel(summary.lastUpdated))}</span><button class="button textButton" type="button" data-path="${path.id}">Lihat jalur ${icon("arrow")}</button></div>
      </div></article>`;
  }).join("") : `<div class="emptyState"><span class="miniIcon">${icon(activeView === "saved" ? "save" : "route")}</span><h3>${activeView === "saved" ? "Belum ada jalur tersimpan" : "Belum ada jalur yang sesuai"}</h3><p>${activeView === "saved"
    ? "Ketuk ikon simpan pada jalur yang ingin kamu cek kembali."
    : "Coba lantai atau area lain, lalu periksa kebutuhan tambahanmu. Jalur yang tidak bisa digunakan tidak masuk rekomendasi."}</p>${activeView === "saved" ? '<button type="button" class="button secondary" data-show-all>Jelajahi rekomendasi</button>' : ""}</div>`;
}

function svgNode(tag, attributes) {
  const result = document.createElementNS("http://www.w3.org/2000/svg", tag);
  Object.entries(attributes).forEach(([key, value]) => result.setAttribute(key, value));
  return result;
}

function renderMap() {
  const plan = globalThis.AksesinRouting.getFloor(appState.prefs.building, appState.prefs.floor);
  const map = $("buildingMap");
  map.replaceChildren();
  map.setAttribute("aria-label", `Peta segmen jalur ${buildingName(appState.prefs.building)}, lantai ${appState.prefs.floor}`);
  $("mapTitle").textContent = buildingName(appState.prefs.building);
  $("mapFloor").textContent = `Lantai ${appState.prefs.floor}`;
  const base = svgNode("svg", { viewBox: "0 0 100 100", preserveAspectRatio: "none", class: "mapBase", "aria-hidden": "true" });
  plan.rooms.forEach((room, index) => {
    base.append(svgNode("rect", { x: room.x, y: room.y, width: room.width, height: room.height, rx: .6, class: room.open ? "mapOpenArea" : "mapRoom" }));
    const label = document.createElement("span");
    label.className = "mapZoneLabel";
    label.style.left = `${room.x + room.width / 2}%`;
    label.style.top = `${room.y + room.height / 2}%`;
    label.textContent = room.open ? "Ruang terbuka" : `Zona ${String.fromCharCode(65 + index)}`;
    map.append(label);
  });
  plan.walls.forEach(({ x1, y1, x2, y2 }) => base.append(svgNode("line", { x1, y1, x2, y2, class: "mapWall" })));
  map.prepend(base);
  let paths = activeView === "saved" ? D.PATHS.filter(path => appState.savedPathIds.includes(path.id)
    && path.buildingId === appState.prefs.building && path.floor === appState.prefs.floor) : qualifyingPaths();
  const selected = D.getPath(selectedPathId);
  if (selected && selected.buildingId === appState.prefs.building && selected.floor === appState.prefs.floor
    && !paths.some(path => path.id === selected.id)) paths = [...paths, selected];
  const layer = svgNode("svg", { viewBox: "0 0 100 100", preserveAspectRatio: "none", class: "mapPaths", "aria-hidden": "true" });
  paths.forEach((path, index) => {
    const condition = summaryFor(path).condition;
    layer.append(svgNode("polyline", {
      points: path.points.map(point => `${point.x},${point.y}`).join(" "),
      class: `mapPath ${condition}${path.id === selectedPathId ? " selected" : ""}`,
      "data-map-path": path.id, "data-condition": condition
    }));
    // Anchor each label on the middle of a real path segment, never inside a room.
    const point = path.points[1];
    const previous = path.points[0];
    const marker = document.createElement("button");
    marker.type = "button";
    marker.className = `mapMarker ${condition}${path.id === selectedPathId ? " selected" : ""}`;
    marker.dataset.path = path.id;
    marker.style.left = `${(point.x + previous.x) / 2}%`;
    marker.style.top = `${(point.y + previous.y) / 2}%`;
    marker.textContent = index + 1;
    marker.title = `${path.name} — ${D.CONDITION_LABELS[condition]}`;
    marker.setAttribute("aria-label", `Jalur ${index + 1}: ${marker.title}`);
    marker.setAttribute("aria-pressed", String(path.id === selectedPathId));
    map.append(marker);
  });
  map.append(layer);
  const compass = document.createElement("span");
  compass.className = "mapCompass";
  compass.textContent = "U";
  compass.setAttribute("aria-label", "Utara pada denah contoh");
  map.append(compass);
  if (!paths.length) {
    const empty = document.createElement("p");
    empty.className = "mapEmpty";
    empty.textContent = "Belum ada jalur untuk pilihan ini. Coba area, lantai, atau kebutuhan lain.";
    map.append(empty);
  }
}

function renderDetail() {
  const path = D.getPath(selectedPathId);
  const detail = $("pathDetail");
  if (!path) {
    detail.innerHTML = `<div class="detailHeading"><h3>Kenali jalur sebelum digunakan</h3></div><p class="pathDescription">Pilih kartu atau nomor jalur untuk melihat kondisi, fasilitas pendukung, dan laporan terbarunya.</p>`;
    delete detail.dataset.condition;
    delete detail.dataset.pathId;
    return;
  }
  const summary = summaryFor(path);
  detail.dataset.condition = summary.condition;
  detail.dataset.pathId = path.id;
  const photoReport = D.getReports(appState, path.id).find(report => report.photo);
  detail.innerHTML = `<div class="detailPhoto"><img src="${escapeHTML(photoReport?.photo || path.image)}" alt="${escapeHTML(photoReport ? `Foto kondisi ${path.name} dari ${photoReport.author}` : path.imageAlt)}" loading="lazy"><span class="imageDisclosure">${photoReport ? "Foto komunitas" : "Ilustrasi jalur"}</span></div>
    <div class="detailHeading"><h3>${escapeHTML(path.name)}</h3>${rating(summary.rating, summary.count)}</div>
    <p class="detailSubtitle">${escapeHTML(buildingName(path.buildingId))} · ${escapeHTML(path.location)}</p>
    <div class="detailFacts"><div class="detailFact">Akses yang tersedia<strong>${escapeHTML(path.features.stepFree ? "Bebas tangga" : "Perhatikan perubahan ketinggian")}</strong></div><div class="detailFact">Pemandu orientasi<strong>${path.features.tactile ? "Ubin pemandu" : path.features.visualSigns ? "Penanda visual" : "Belum tersedia"}</strong></div><div class="detailFact">Permukaan jalur<strong>${path.features.nonSlip ? "Lapisan antiselip" : "Perlu hati-hati saat basah"}</strong></div><div class="detailFact">Pembaruan kondisi<strong>${escapeHTML(timeLabel(summary.lastUpdated))}</strong></div></div>
    <div class="detailCondition ${summary.condition}">${badge(summary.condition)}<p>${escapeHTML(summary.latestReport?.comment || path.description)}</p><p>${summary.latestReport?.demo ? "Data contoh" : `Dilaporkan oleh ${escapeHTML(summary.latestReport?.author || "komunitas")}`} · kondisi menurut laporan terbaru</p></div>
    <div class="detailActions"><button type="button" class="button textButton" data-forum="${path.id}">Lihat ${summary.count} ulasan ${icon("arrow")}</button><button type="button" class="button secondary" data-report="${path.id}">${icon("plus")}Update kondisi</button></div>`;
}

function renderDiscovery() {
  const recommended = D.recommend(appState, { floor: appState.prefs.floor });
  const paths = activeView === "saved" ? D.PATHS.filter(path => appState.savedPathIds.includes(path.id)) : recommended;
  if (!selectedPathId) selectedPathId = paths[0]?.id || "";
  $("resultCount").textContent = paths.length;
  $("savedCount").textContent = appState.savedPathIds.length;
  $("recommendationSummary").textContent = activeView === "saved"
    ? "Jalur yang kamu simpan dari semua area. Kondisinya tetap mengikuti laporan terbaru."
    : `${needName(appState.prefs.need)} · ${buildingName(appState.prefs.building)} · lantai ${appState.prefs.floor}`;
  ["allPathsTab", "savedPathsTab"].forEach((id, index) => {
    const selected = index === 0 ? activeView === "all" : activeView === "saved";
    $(id).classList.toggle("active", selected);
    $(id).setAttribute("aria-pressed", String(selected));
  });
  $("exploreLink").classList.toggle("active", activeView === "all");
  $("savedLink").classList.toggle("active", activeView === "saved");
  const requirements = D.parseComplaint(appState.prefs.complaint);
  $("requirementTags").innerHTML = requirements.map(feature => `<span class="requirementTag">${D.FEATURE_LABELS[feature]}</span>`).join("");
  if (appState.prefs.complaint && !requirements.length) {
    $("requirementTags").textContent = "Catatan tersimpan. Gunakan kata kendala di atas untuk mempersempit jalur.";
  }
  const blocked = qualifyingPaths().filter(path => summaryFor(path).condition === "blocked");
  $("conditionNotice").hidden = !blocked.length || activeView === "saved";
  $("conditionNotice").innerHTML = `${blocked.length} jalur sesuai profil sedang tidak bisa digunakan: ${blocked.map(path => `<button type="button" class="button textButton" data-path="${path.id}">${escapeHTML(path.name)}</button>`).join(", ")}. Lihat laporan kondisi sebelum menggunakan jalur.`;
  renderCards(paths);
  renderMap();
  renderDetail();
}

function renderForumOptions() {
  const paths = D.PATHS.filter(path => path.buildingId === appState.prefs.building);
  if (!paths.some(path => path.id === forumFilter)) forumFilter = "";
  $("forumPathFilter").replaceChildren(new Option("Semua jalur di area ini", ""), ...paths.map(path => new Option(path.name, path.id)));
  $("forumPathFilter").value = forumFilter;
}

function renderForum() {
  const reports = D.getReports(appState, forumFilter || undefined)
    .filter(report => D.getPath(report.pathId).buildingId === appState.prefs.building);
  $("reportCount").textContent = reports.length;
  $("forumFeed").innerHTML = reports.length ? reports.map(report => {
    const path = D.getPath(report.pathId);
    const initials = report.author.split(/\s+/).slice(0, 2).map(part => [...part][0] || "").join("").toUpperCase();
    return `<article class="forumEntry" data-report-id="${escapeHTML(report.id)}" data-condition="${report.condition}"><div class="commentTop"><span class="commentAvatar" aria-hidden="true">${escapeHTML(initials)}</span><div><h4 class="commentAuthor">${escapeHTML(report.author)}${report.demo ? '<span class="demoChip">Contoh</span>' : ""}</h4><p class="commentMeta">${escapeHTML(needName(report.need))} · ${escapeHTML(timeLabel(report.createdAt))}</p></div>${rating(report.rating)}</div>
      <button type="button" class="commentPath" data-path="${path.id}">${icon("pin")}${escapeHTML(path.name)} · lantai ${path.floor}</button><p class="commentBody">${escapeHTML(report.comment)}</p>
      ${report.photo ? `<img class="commentPhoto" src="${escapeHTML(report.photo)}" alt="Foto kondisi ${escapeHTML(path.name)} dari ${escapeHTML(report.author)}" loading="lazy">` : ""}
      <div class="commentBottom">${badge(report.condition)}<time datetime="${report.createdAt}">${escapeHTML(new Date(report.createdAt).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" }))}</time></div></article>`;
  }).join("") : '<div class="emptyState"><h3>Belum ada kabar di jalur ini</h3><p>Jadilah yang pertama membagikan kondisi yang kamu temui.</p></div>';
}

function renderAll() {
  renderDiscovery();
  renderForumOptions();
  renderForum();
}

function setView(view) {
  activeView = view;
  selectedPathId = "";
  renderDiscovery();
}

function selectPath(id, scroll = false) {
  const path = D.getPath(id);
  if (!path) return;
  const changedArea = appState.prefs.building !== path.buildingId;
  appState.prefs.building = path.buildingId;
  appState.prefs.floor = path.floor;
  selectedPathId = id;
  if (changedArea) forumFilter = "";
  persist();
  syncPreferenceControls();
  renderAll();
  if (scroll) $("pathDetail").scrollIntoView({ behavior: "smooth", block: "center" });
}

function applyPreferences() {
  clearTimeout(complaintTimer);
  const building = $("buildingSelect").value;
  if (building !== appState.prefs.building) forumFilter = "";
  appState.prefs = {
    building, floor: Number($("floorSelect").value),
    need: document.querySelector('input[name="need"]:checked').value,
    complaint: $("complaintInput").value
  };
  selectedPathId = "";
  activeView = "all";
  persist();
  renderAll();
}

function renderRatingChoice() {
  const value = Number(document.querySelector('input[name="rating"]:checked')?.value || 0);
  document.querySelectorAll('.ratingChoices label').forEach((label, index) => label.classList.toggle("filled", index < value));
  $("ratingDescription").textContent = value ? `${value} dari 5 · ${["", "Sangat kurang nyaman", "Kurang nyaman", "Cukup nyaman", "Nyaman", "Sangat nyaman"][value]}` : "Pilih rating 1–5";
}

function renderPhotoPreview() {
  $("photoPreview").hidden = !appState.draft.photo;
  if (appState.draft.photo) $("reportPhotoPreview").src = appState.draft.photo;
  else $("reportPhotoPreview").removeAttribute("src");
}

function fillReportForm() {
  const draft = appState.draft;
  $("reportPath").replaceChildren(...D.PATHS.map(path => new Option(`${buildingName(path.buildingId)} · ${path.name} · lantai ${path.floor}`, path.id)));
  $("reportPath").value = draft.pathId;
  $("reportAuthor").value = draft.author;
  $("reportComment").value = draft.comment;
  $("reportPhoto").value = "";
  document.querySelectorAll('input[name="rating"]').forEach(input => { input.checked = Number(input.value) === draft.rating; });
  document.querySelectorAll('input[name="condition"]').forEach(input => { input.checked = input.value === draft.condition; });
  renderRatingChoice();
  renderPhotoPreview();
  $("reportError").hidden = true;
}

function openReport(pathId) {
  photoVersion++;
  processingPhoto = false;
  $("submitReportButton").disabled = false;
  const draft = appState.draft;
  const hasDraft = Boolean(draft.pathId && (draft.comment || draft.rating || draft.photo));
  const target = D.getPath(pathId)?.id || (hasDraft ? draft.pathId : selectedPathId)
    || D.PATHS.find(path => path.buildingId === appState.prefs.building && path.floor === appState.prefs.floor)?.id;
  if (!hasDraft || (pathId && draft.pathId !== pathId)) {
    appState.draft = { ...draft, pathId: target, need: appState.prefs.need, condition: D.summarize(target, appState).condition };
  }
  persist();
  fillReportForm();
  if (!$("reportDialog").open) $("reportDialog").showModal();
}

function captureDraft() {
  appState.draft = {
    ...appState.draft, pathId: $("reportPath").value, author: $("reportAuthor").value,
    rating: Number(document.querySelector('input[name="rating"]:checked')?.value || 0),
    condition: document.querySelector('input[name="condition"]:checked')?.value || "available",
    comment: $("reportComment").value
  };
  persist();
  renderRatingChoice();
}

function closeReport() {
  captureDraft();
  $("reportDialog").close();
}

function reportError(message) {
  $("reportError").textContent = message;
  $("reportError").hidden = false;
}

async function compressPhoto(file) {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) throw new Error("Pilih foto JPG, PNG, atau WebP.");
  if (file.size > 5 * 1024 * 1024) throw new Error("Ukuran foto maksimal 5 MB.");
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    const canvas = document.createElement("canvas");
    let scale = Math.min(1, 900 / Math.max(image.naturalWidth, image.naturalHeight));
    for (let attempt = 0; attempt < 4; attempt++) {
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      canvas.getContext("2d").drawImage(image, 0, 0, canvas.width, canvas.height);
      const photo = canvas.toDataURL("image/jpeg", .77);
      if (D.validPhoto(photo)) return photo;
      scale *= .7;
    }
    throw new Error("Foto masih terlalu besar untuk penyimpanan sementara. Pilih foto yang lebih kecil.");
  } finally { URL.revokeObjectURL(url); }
}

$("preferencesForm").addEventListener("submit", event => {
  event.preventDefault();
  applyPreferences();
  $("explore").scrollIntoView({ behavior: "smooth", block: "start" });
});
$("preferencesForm").addEventListener("change", event => {
  if (event.target.id === "buildingSelect") $("floorSelect").value = "1";
  applyPreferences();
});
$("complaintInput").addEventListener("input", () => {
  appState.prefs.complaint = $("complaintInput").value;
  persist();
  clearTimeout(complaintTimer);
  complaintTimer = setTimeout(applyPreferences, 250);
});
$("allPathsTab").addEventListener("click", () => setView("all"));
$("savedPathsTab").addEventListener("click", () => setView("saved"));
$("exploreLink").addEventListener("click", () => setView("all"));
$("savedLink").addEventListener("click", () => setView("saved"));
$("forumPathFilter").addEventListener("change", event => { forumFilter = event.target.value; renderForum(); });

document.addEventListener("click", event => {
  const saveButton = event.target.closest("[data-save]");
  if (saveButton) {
    const id = saveButton.dataset.save;
    if (!D.getPath(id)) return;
    const wasSaved = appState.savedPathIds.includes(id);
    appState.savedPathIds = wasSaved ? appState.savedPathIds.filter(value => value !== id) : [...appState.savedPathIds, id];
    const saved = persist();
    renderDiscovery();
    toast(saved ? wasSaved ? "Jalur dihapus dari daftar tersimpan." : "Jalur disimpan. Kamu bisa membukanya kembali kapan saja."
      : "Pilihan diperbarui di halaman ini, tetapi penyimpanan browser gagal. Unduh data sebelum menutup halaman.");
    return;
  }
  const pathButton = event.target.closest("[data-path]");
  if (pathButton) { selectPath(pathButton.dataset.path, !pathButton.classList.contains("mapMarker")); return; }
  const reportButton = event.target.closest("[data-report]");
  if (reportButton) { openReport(reportButton.dataset.report); return; }
  const forumButton = event.target.closest("[data-forum]");
  if (forumButton) {
    forumFilter = forumButton.dataset.forum;
    renderForumOptions(); renderForum();
    $("community").scrollIntoView({ behavior: "smooth", block: "start" });
  }
  if (event.target.closest("[data-show-all]")) setView("all");
});

$("openReportButton").addEventListener("click", () => openReport());
$("closeReportButton").addEventListener("click", closeReport);
$("reportDialog").addEventListener("cancel", () => captureDraft());
$("reportForm").addEventListener("input", event => {
  if (event.target.id !== "reportPhoto") captureDraft();
});
$("reportForm").addEventListener("change", event => {
  if (event.target.id === "reportPath") {
    const condition = D.summarize($("reportPath").value, appState).condition;
    document.querySelector(`input[name="condition"][value="${condition}"]`).checked = true;
  }
  if (event.target.id !== "reportPhoto") captureDraft();
});
$("reportPhoto").addEventListener("change", async event => {
  const file = event.target.files[0];
  if (!file) return;
  const version = ++photoVersion;
  processingPhoto = true;
  $("submitReportButton").disabled = true;
  $("reportError").hidden = true;
  try {
    const photo = await compressPhoto(file);
    if (version !== photoVersion) return;
    appState.draft.photo = photo;
    captureDraft();
    renderPhotoPreview();
  } catch (error) {
    if (version === photoVersion) reportError(error.message || "Foto tidak dapat dibaca. Pilih foto lain.");
  } finally {
    if (version === photoVersion) {
      processingPhoto = false;
      $("submitReportButton").disabled = false;
    }
  }
});
$("removePhotoButton").addEventListener("click", () => {
  photoVersion++;
  processingPhoto = false;
  $("submitReportButton").disabled = false;
  appState.draft.photo = "";
  $("reportPhoto").value = "";
  captureDraft();
  renderPhotoPreview();
});
$("reportForm").addEventListener("submit", event => {
  event.preventDefault();
  if (processingPhoto) return;
  captureDraft();
  const values = { ...appState.draft, author: appState.draft.author.trim() || "Pengunjung" };
  // Merge the latest locally stored reports before appending, so another tab's
  // newly submitted report is retained along with this tab's in-memory data.
  const latest = D.loadState();
  if (latest.saved) {
    appState.reports = [...new Map([...appState.reports, ...latest.state.reports].map(report => [report.id, report])).values()];
  }
  const result = D.addReport(appState, values);
  if (!result.report) { reportError(Object.values(result.errors).join(" ")); return; }
  appState = result.state;
  const path = D.getPath(result.report.pathId);
  selectedPathId = path.id;
  appState.prefs.building = path.buildingId;
  appState.prefs.floor = path.floor;
  const saved = persist();
  forumFilter = path.id;
  $("reportDialog").close();
  syncPreferenceControls();
  renderAll();
  toast(saved ? "Terima kasih! Komentar, rating, dan kondisi jalur sudah diperbarui serta disimpan di perangkat ini."
    : "Laporan tampil di halaman ini, tetapi belum tersimpan. Unduh data sebelum menutup halaman.");
});

window.addEventListener("storage", event => {
  if (event.key !== D.STORAGE_KEY || event.newValue === null) return;
  const localDraft = $("reportDialog").open ? { ...appState.draft } : null;
  const updated = D.loadState();
  if (!updated.saved) return;
  // Preserve any unsaved in-memory reports if storage was previously full.
  if (!storageHealthy) updated.state.reports = [...new Map([...appState.reports, ...updated.state.reports].map(report => [report.id, report])).values()];
  appState = updated.state;
  if (localDraft) appState.draft = localDraft;
  selectedPathId = "";
  syncPreferenceControls();
  renderAll();
  storageFeedback(updated.saved, updated.error);
});

function exportData() {
  const file = new Blob([JSON.stringify(appState, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(file);
  const link = document.createElement("a");
  link.href = url;
  link.download = `aksesin-data-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast("Cadangan berisi pilihan, jalur tersimpan, draf, dan laporan di perangkat ini.");
}
$("exportDataButton").addEventListener("click", exportData);
$("exportFooterButton").addEventListener("click", exportData);

window.addEventListener("pagehide", () => {
  if ($("reportDialog").open) captureDraft();
  else persist();
});
syncPreferenceControls();
renderAll();
storageFeedback(initialData.saved, initialData.error);
if (!initialData.saved) toast("Data sebelumnya tidak dapat dimuat. Kamu tetap bisa menggunakan aplikasi; periksa indikator penyimpanan.");
