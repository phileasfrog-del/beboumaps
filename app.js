const CATEGORIES = [
  { id: "restaurant", label: "Restaurants", color: "#c23b22" },
  { id: "snack", label: "Snack / Thé", color: "#d48a15" },
  { id: "shopping", label: "Shopping", color: "#7b3fa0" },
  { id: "disquaire", label: "Disquaires", color: "#1f7a6b" },
  { id: "musee", label: "Musées", color: "#2b5ea7" },
  { id: "temple", label: "Temples", color: "#c9a227" },
  { id: "promenade", label: "Promenades", color: "#3d7a3a" },
  { id: "nuit", label: "Promenades nuit", color: "#243a6b" },
  { id: "excursion", label: "Excursions", color: "#8b5a2b" },
  { id: "hotel", label: "Hôtel", color: "#5c6b73" }
];

const catById = Object.fromEntries(CATEGORIES.map((c) => [c.id, c]));
const active = new Set(CATEGORIES.map((c) => c.id));
const markersById = new Map();
const listCheckboxesById = new Map();
const VISITED_STORAGE_KEY = "shanghai-visited-places";
const LIST_SCROLL_STORAGE_KEY = "shanghai-list-scroll-top";
const LIST_OPEN_STORAGE_KEY = "shanghai-list-was-open";
let visitedPlaces = new Set();
try {
  visitedPlaces = new Set(JSON.parse(localStorage.getItem(VISITED_STORAGE_KEY) || "[]"));
} catch (error) { /* Keep an empty set if local storage is unavailable or malformed. */ }
let selectedPlace = null;
let forceVisiblePlaceId = null;
let darkMode = false;
try { darkMode = localStorage.getItem("shanghai-dark-mode") === "true"; } catch (error) { /* Use light mode when storage is unavailable. */ }
document.body.classList.toggle("dark-mode", darkMode);
const themeToggle = document.getElementById("theme-toggle");
themeToggle.setAttribute("aria-pressed", String(darkMode));
themeToggle.setAttribute("aria-label", darkMode ? "Activer le mode clair" : "Activer le mode sombre");
function syncInstalledAppTheme() {
  const color = darkMode ? "#111519" : "#f4efe6";
  const variant = darkMode ? "dark" : "bright";
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", color);
  document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]')?.setAttribute("content", darkMode ? "black" : "default");
  document.getElementById("brand-logo")?.setAttribute("src", `icons/logo-${variant}.png`);
  document.getElementById("site-favicon")?.setAttribute("href", `icons/favicon-${variant}-512.png`);
  document.getElementById("app-touch-icon")?.setAttribute("href", `icons/apple-touch-${variant}.png`);
  document.getElementById("app-manifest")?.setAttribute("href", darkMode ? "manifest-dark.webmanifest" : "manifest.webmanifest");
}
syncInstalledAppTheme();

const SHANGHAI_CENTER = [121.4737, 31.2304];
const MAP_LIGHT_STYLE_URL = "https://tiles.openfreemap.org/styles/positron";
const MAP_DARK_STYLE_URL = "https://tiles.openfreemap.org/styles/dark";
const MAP_STYLE_URLS = [MAP_LIGHT_STYLE_URL, MAP_DARK_STYLE_URL];
const map = new maplibregl.Map({
  container: "map",
  style: darkMode ? MAP_DARK_STYLE_URL : MAP_LIGHT_STYLE_URL,
  center: SHANGHAI_CENTER,
  zoom: 11.7,
  minZoom: 8,
  maxZoom: 19,
  attributionControl: true,
  transformRequest: (url) => {
    if (!navigator.serviceWorker?.controller || !url.startsWith("https://tiles.openfreemap.org/")) return { url };
    const proxy = new URL("ofm-proxy", document.baseURI);
    proxy.searchParams.set("url", url);
    return { url: proxy.href };
  }
});

map.addControl(new maplibregl.ScaleControl({ maxWidth: 120, unit: "metric" }), "bottom-left");
const geolocateControl = new maplibregl.GeolocateControl({
  positionOptions: { enableHighAccuracy: true },
  trackUserLocation: false,
  showUserHeading: true
});
map.addControl(geolocateControl, "top-right");
document.getElementById("btn-gps").addEventListener("click", () => geolocateControl.trigger());


function pinElement(color) {
  const element = document.createElement("div");
  element.className = "pin";
  element.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="36" viewBox="0 0 28 36" aria-hidden="true">
    <path d="M14 1.5c6.35 0 11.5 5.05 11.5 11.28 0 8.4-11.5 21.22-11.5 21.22S2.5 21.18 2.5 12.78C2.5 6.55 7.65 1.5 14 1.5z" fill="${color}" stroke="${darkMode ? "#080808" : "#fff"}" stroke-width="1.6"/>
    <circle cx="14" cy="12.5" r="3.6" fill="#fff"/>
  </svg>`;
  element.setAttribute("role", "button");
  element.setAttribute("tabindex", "0");
  return element;
}

const sheet = document.getElementById("sheet");
const visitedToggle = document.getElementById("visited-toggle");

function updateVisitedState(placeId, visited) {
  const currentCard = listContent.querySelector(`[data-place-id="${CSS.escape(placeId)}"]`);
  const district = currentCard?.dataset.listDistrict;
  const districtPlaces = district ? placesForListDistrict(district) : [];
  const wasComplete = districtPlaces.length > 0 && districtPlaces.every((place) => visitedPlaces.has(place.id));
  if (visited) visitedPlaces.add(placeId);
  else visitedPlaces.delete(placeId);
  try { localStorage.setItem(VISITED_STORAGE_KEY, JSON.stringify([...visitedPlaces])); } catch (error) { /* Keep the current session state. */ }
  const marker = markersById.get(placeId);
  if (marker) marker.getElement().classList.toggle("visited-pin", visited);
  const card = listContent?.querySelector(`[data-place-id="${CSS.escape(placeId)}"]`);
  if (card) card.classList.toggle("visited-collapsed", visited);
  if (card) {
    const completed = updateDistrictCount(card.dataset.listDistrict);
    const total = placesForListDistrict(card.dataset.listDistrict).length;
    if (visited && !wasComplete && completed === total) celebrateDistrictCompletion(card.dataset.listDistrict);
  }
  const listCheckbox = listCheckboxesById.get(placeId);
  if (listCheckbox) listCheckbox.checked = visited;
}

function openSheet(place) {
  selectedPlace = place;
  const cat = catById[place.category];
  document.getElementById("sheet-cat").textContent = cat.label;
  document.getElementById("sheet-cat").style.color = cat.color;
  document.getElementById("sheet-title").textContent = place.name;
  visitedToggle.setAttribute("aria-pressed", String(visitedPlaces.has(place.id)));
  visitedToggle.textContent = visitedPlaces.has(place.id) ? "Marqué comme vu · annuler" : "Marquer comme vu";
  document.getElementById("sheet-zh").textContent = place.nameZh;
  const photo = document.getElementById("sheet-image");
  photo.src = place.image;
  photo.alt = `Vue de ${place.name}`;
  const bits = [place.district, place.branch].filter(Boolean);
  document.getElementById("sheet-meta").textContent = bits.join(" · ");
  document.getElementById("sheet-desc").textContent = place.description;
  const spec = document.getElementById("sheet-spec");
  spec.textContent = place.specialites ? `Spécialités · ${place.specialites}` : "";
  const practical = document.getElementById("sheet-practical");
  practical.textContent = place.practical || "";
  const info = document.getElementById("sheet-info");
  let infoUrl = "";
  try {
    const parsedInfoUrl = new URL(place.infoUrl || "", document.baseURI);
    if (["http:", "https:"].includes(parsedInfoUrl.protocol) && place.infoUrl) infoUrl = parsedInfoUrl.href;
  } catch (error) { /* Hide malformed or missing practical-information links. */ }
  info.href = infoUrl || "#";
  // Same-tab navigation works reliably when the site is installed as a mobile app.
  info.target = "_self";
  info.removeAttribute("rel");
  info.hidden = !infoUrl;
  document.getElementById("sheet-addr").textContent = place.address;
  const link = document.getElementById("sheet-amap");
  link.href = place.amapUrl || "#";
  link.hidden = !place.amapUrl;
  sheet.hidden = false;
}

function closeSheet() {
  sheet.hidden = true;
}

document.addEventListener("click", (event) => {
  if (sheet.hidden || sheet.contains(event.target)) return;
  // The list is layered over the map; closing or using it must leave the card underneath open.
  if (event.target.closest?.("#place-list-dialog")) return;
  // Clicking another map marker should replace the open card, not close it afterward.
  if (event.target.closest?.(".maplibregl-marker")) return;
  closeSheet();
});

document.getElementById("sheet-title").addEventListener("click", (event) => {
  event.preventDefault();
  if (selectedPlace) focusListPlace(selectedPlace.id);
});

document.getElementById("sheet-close").addEventListener("click", closeSheet);
visitedToggle.addEventListener("click", () => {
  if (!selectedPlace) return;
  updateVisitedState(selectedPlace.id, !visitedPlaces.has(selectedPlace.id));
  const visited = visitedPlaces.has(selectedPlace.id);
  visitedToggle.setAttribute("aria-pressed", String(visited));
  visitedToggle.textContent = visited ? "Marqué comme vu · annuler" : "Marquer comme vu";
});

themeToggle.addEventListener("click", () => {
  darkMode = !darkMode;
  document.body.classList.toggle("dark-mode", darkMode);
  syncInstalledAppTheme();
  themeToggle.setAttribute("aria-pressed", String(darkMode));
  themeToggle.setAttribute("aria-label", darkMode ? "Activer le mode clair" : "Activer le mode sombre");
  try { localStorage.setItem("shanghai-dark-mode", String(darkMode)); } catch (error) { /* Theme still changes for this session. */ }
  map.setStyle(darkMode ? MAP_DARK_STYLE_URL : MAP_LIGHT_STYLE_URL);
  addMarkers();
});

function addMarkers() {
  markersById.forEach((marker) => marker.remove());
  markersById.clear();
  const q = document.getElementById("search").value.trim().toLowerCase();

  PLACES.forEach((place) => {
    const forced = place.id === forceVisiblePlaceId;
    if (!active.has(place.category) && !forced) return;
    const hay = [place.name, place.nameZh, place.district, place.branch, place.address]
      .join(" ")
      .toLowerCase();
    if (q && !hay.includes(q) && !forced) return;

    const marker = new maplibregl.Marker({
      element: pinElement(catById[place.category].color),
      anchor: "bottom"
    }).setLngLat([place.lng, place.lat]);
    if (visitedPlaces.has(place.id)) marker.getElement().classList.add("visited-pin");
    const showPlace = () => {
      openSheet(place);
      map.panTo(marker.getLngLat(), { duration: 500 });
    };
    marker.getElement().setAttribute("aria-label", `Afficher ${place.name}`);
    marker.getElement().addEventListener("click", showPlace);
    marker.getElement().addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        showPlace();
      }
    });
    marker.addTo(map);
    markersById.set(place.id, marker);
  });
}

const legendRoot = document.getElementById("legend-items");
const legend = document.querySelector(".legend");
const legendToggle = document.getElementById("legend-toggle");
const legendButtons = new Map();

const selectAllButton = document.createElement("button");
selectAllButton.type = "button";
selectAllButton.className = "legend-select-all";
selectAllButton.addEventListener("click", () => {
  const allSelected = CATEGORIES.every((category) => active.has(category.id));
  if (allSelected) active.clear();
  else CATEGORIES.forEach((category) => active.add(category.id));
  syncLegendButtons();
  closeSheet();
  addMarkers();
});
legendRoot.appendChild(selectAllButton);

function syncLegendButtons() {
  CATEGORIES.forEach((category) => {
    const button = legendButtons.get(category.id);
    if (button) button.classList.toggle("off", !active.has(category.id));
  });
  const allSelected = CATEGORIES.every((category) => active.has(category.id));
  selectAllButton.textContent = allSelected ? "Tout désélectionner" : "Tout sélectionner";
  selectAllButton.setAttribute("aria-pressed", String(allSelected));
}

legendToggle.addEventListener("click", () => {
  const expanded = legend.classList.toggle("open");
  legendToggle.setAttribute("aria-expanded", String(expanded));
});
document.addEventListener("click", (event) => {
  const isMobileLayout = window.matchMedia("(max-width: 720px), (max-height: 520px) and (orientation: landscape)").matches;
  if (isMobileLayout && legend.classList.contains("open") && !legend.contains(event.target)) {
    legend.classList.remove("open");
    legendToggle.setAttribute("aria-expanded", "false");
  }
});
function closeLegendAfterOrientationChange() {
  legend.classList.remove("open");
  legendToggle.setAttribute("aria-expanded", "false");
  map.resize();
}
window.addEventListener("orientationchange", closeLegendAfterOrientationChange);
screen.orientation?.addEventListener?.("change", closeLegendAfterOrientationChange);
CATEGORIES.forEach((cat) => {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "legend-item";
  btn.dataset.id = cat.id;
  btn.innerHTML = `<span class="swatch" style="background:${cat.color};color:${cat.color}"></span>${cat.label}`;
  btn.addEventListener("click", () => {
    if (active.has(cat.id)) active.delete(cat.id);
    else active.add(cat.id);
    forceVisiblePlaceId = null;
    syncLegendButtons();
    closeSheet();
    addMarkers();
  });
  legendButtons.set(cat.id, btn);
  legendRoot.appendChild(btn);
});
syncLegendButtons();

document.getElementById("search").addEventListener("input", () => {
  forceVisiblePlaceId = null;
  closeSheet();
  addMarkers();
});

// Interactive, PDF-inspired place index.
const listDialog = document.getElementById("place-list-dialog");
const listContent = document.getElementById("place-list-content");
const listSearch = document.getElementById("list-search");
const listButton = document.getElementById("btn-list");
let savedListScrollTop = 0;
const listSectionsByDistrict = new Map();
try { savedListScrollTop = Number(sessionStorage.getItem(LIST_SCROLL_STORAGE_KEY) || 0); } catch (error) { /* Keep the initial reading position. */ }

function persistListReadingState(isOpen = listDialog.open) {
  savedListScrollTop = listContent.scrollTop;
  try {
    sessionStorage.setItem(LIST_SCROLL_STORAGE_KEY, String(savedListScrollTop));
    sessionStorage.setItem(LIST_OPEN_STORAGE_KEY, String(isOpen));
  } catch (error) { /* The in-memory position remains available for this visit. */ }
}

function makeElement(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function getListDescription(place) {
  return LIST_DESCRIPTIONS[place.id] || place.description || "";
}

function focusListPlace(placeId) {
  const card = listContent.querySelector(`[data-place-id="${CSS.escape(placeId)}"]`);
  if (!card) return;
  if (!listDialog.open) listDialog.showModal();
  requestAnimationFrame(() => {
    const description = card.querySelector(".list-description");
    card.classList.add("list-entry-focus");
    description?.scrollIntoView({ behavior: "smooth", block: "center" });
    if (!description) card.scrollIntoView({ behavior: "smooth", block: "center" });
    window.setTimeout(() => card.classList.remove("list-entry-focus"), 3200);
    persistListReadingState(true);
  });
}

function excursionSorted(places) {
  const byId = new Map(places.map((place) => [place.id, place]));
  return ["suzhou", "zhujiajiao", "wuzhen"].map((id) => byId.get(id)).filter(Boolean);
}

function addListEntry(place, sectionHeader) {
  const category = catById[place.category];
  const card = makeElement("article", "list-entry");
  card.style.setProperty("--entry-color", category?.color || "#c23b22");
  card.dataset.placeId = place.id;
  card.dataset.listDistrict = sectionHeader.dataset.listDistrict;
  const heading = makeElement("div", "list-entry-heading");
  const visitedLabel = makeElement("label", "list-visited");
  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.checked = visitedPlaces.has(place.id);
  checkbox.setAttribute("aria-label", `Marquer ${place.name} comme déjà visité`);
  checkbox.addEventListener("change", () => updateVisitedState(place.id, checkbox.checked));
  visitedLabel.append(checkbox, makeElement("span", "sr-only", "Déjà visité"));
  listCheckboxesById.set(place.id, checkbox);

  const title = makeElement("button", "list-place-name", place.name);
  title.type = "button";
  title.addEventListener("click", () => {
    focusListPlace(place.id);
  });
  const mapPin = makeElement("button", "list-map-pin");
  mapPin.type = "button";
  mapPin.setAttribute("aria-label", `Afficher ${place.name} sur la carte`);
  mapPin.title = "Afficher sur la carte";
  mapPin.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 22s7-7.1 7-13a7 7 0 1 0-14 0c0 5.9 7 13 7 13Z"/><circle cx="12" cy="9" r="2.3"/></svg>';
  mapPin.addEventListener("click", () => {
    forceVisiblePlaceId = place.id;
    listDialog.close();
    addMarkers();
    map.flyTo({ center: [place.lng, place.lat], zoom: Math.max(map.getZoom(), 15), duration: 650 });
    openSheet(place);
  });
  heading.append(visitedLabel, title, mapPin);
  card.appendChild(heading);

  if (place.nameZh) card.appendChild(makeElement("p", "list-place-zh", place.nameZh));
  if (place.branch) {
    const branch = makeElement("p", "list-branch");
    branch.append(
      makeElement("strong", "", place.category === "excursion" ? "Temps de trajet · " : "Adresse / antenne · "),
      document.createTextNode(place.branch)
    );
    card.appendChild(branch);
  }
  const description = makeElement("p", "list-description", getListDescription(place));
  card.appendChild(description);
  card.classList.toggle("visited-collapsed", checkbox.checked);
  if (place.specialites) {
    const specialities = makeElement("p", "list-specialties");
    const label = makeElement("strong", "", "Spécialités · ");
    specialities.append(label, document.createTextNode(place.specialites));
    card.appendChild(specialities);
  }
  if (place.address) {
    const address = makeElement("p", "list-address");
    const addressLink = makeElement("a", "", place.address);
    addressLink.href = place.amapUrl || "#";
    address.appendChild(addressLink);
    card.appendChild(address);
  }
  if (!["promenade", "nuit", "excursion"].includes(place.category)) {
    const practical = makeElement("p", "list-practical");
    practical.append(
      makeElement("strong", "", "Horaires / infos · "),
      document.createTextNode(place.practical || "Horaires à vérifier auprès du lieu.")
    );
    card.appendChild(practical);
  }
  const searchText = [place.name, place.nameZh, place.district, place.branch, place.address, getListDescription(place), place.specialites, place.practical]
    .filter(Boolean).join(" ").toLocaleLowerCase("fr");
  card.dataset.search = searchText;
  sectionHeader.parentElement.appendChild(card);
  return card;
}

function renderPlaceList() {
  listCheckboxesById.clear();
  listSectionsByDistrict.clear();
  listContent.replaceChildren();
  const regularPlaces = PLACES.filter((place) => place.category !== "excursion");
  const districtNames = [...new Set(regularPlaces.map((place) => place.district || "Shanghai"))];
  const grouped = new Map(districtNames.map((district) => [district, regularPlaces.filter((place) => (place.district || "Shanghai") === district)]));
  const excursionPlaces = excursionSorted(PLACES.filter((place) => place.category === "excursion"));
  if (excursionPlaces.length) grouped.set("Hors Shanghai", excursionPlaces);

  const districtNav = makeElement("nav", "list-district-nav");
  districtNav.setAttribute("aria-label", "Accès aux quartiers");
  grouped.forEach((places, district) => {
    const link = makeElement("button", "list-district-link", district);
    link.type = "button";
    link.addEventListener("click", () => {
      const target = listSectionsByDistrict.get(district);
      target?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    districtNav.appendChild(link);
  });
  listContent.appendChild(districtNav);

  grouped.forEach((places, district) => {
    const section = makeElement("section", "list-section");
    const header = makeElement("h3", "list-district-title", `${district} · ${places.length} ${places.length === 1 ? "lieu" : "lieux"}`);
    header.tabIndex = -1;
    header.dataset.total = String(places.length);
    header.dataset.listDistrict = district;
    section.appendChild(header);
    listSectionsByDistrict.set(district, header);
    places.forEach((place) => addListEntry(place, header));
    listContent.appendChild(section);
    updateDistrictCount(district);
  });
}

function placesForListDistrict(district) {
  if (district === "Hors Shanghai") return PLACES.filter((place) => place.category === "excursion");
  return PLACES.filter((place) => place.category !== "excursion" && (place.district || "Shanghai") === district);
}

function updateDistrictCount(district) {
  const header = listSectionsByDistrict.get(district);
  if (!header) return null;
  const places = placesForListDistrict(district);
  const completed = places.filter((place) => visitedPlaces.has(place.id)).length;
  const total = Number(header.dataset.total || places.length);
  header.textContent = `${district} · ${completed} / ${total} ${total === 1 ? "lieu" : "lieux"}`;
  return completed;
}

function celebrateDistrictCompletion(district) {
  const compact = window.matchMedia("(max-width: 720px), (max-height: 520px) and (orientation: landscape)").matches;
  const overlay = document.createElement("canvas");
  overlay.className = "fireworks-overlay";
  overlay.setAttribute("aria-hidden", "true");
  const context = overlay.getContext("2d");
  if (!context) return;
  const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
  const width = window.innerWidth;
  const height = window.innerHeight;
  overlay.width = Math.round(width * pixelRatio);
  overlay.height = Math.round(height * pixelRatio);
  context.scale(pixelRatio, pixelRatio);
  const bursts = [[12, 25], [36, 19], [64, 22], [88, 34], [23, 62], [51, 49], [78, 66], [50, 82]];
  const duration = compact ? 1600 : 2200;
  const startedAt = performance.now();
  const particles = [];
  bursts.forEach(([x, y], burstIndex) => {
    const particleCount = 32;
    for (let i = 0; i < particleCount; i++) {
      const angle = (Math.PI * 2 * i) / particleCount;
      const distance = 130 + ((i * 47 + burstIndex * 31) % 230);
      particles.push({
        x: width * x / 100,
        y: height * y / 100,
        angle,
        distance,
        delay: burstIndex * (compact ? 45 : 60),
        radius: 9.5,
        hue: [0, 8, 16][(i + burstIndex) % 3],
      });
    }
  });
  function drawFireworks(now) {
    const elapsed = now - startedAt;
    context.clearRect(0, 0, width, height);
    let active = false;
    particles.forEach((particle) => {
      const age = elapsed - particle.delay;
      if (age < 0) { active = true; return; }
      if (age >= duration) return;
      active = true;
      const progress = age / duration;
      const travel = 1 - (1 - progress) ** 2;
      const opacity = Math.sin(Math.PI * progress) * (1 - progress * .35);
      const px = particle.x + Math.cos(particle.angle) * particle.distance * travel;
      const py = particle.y + Math.sin(particle.angle) * particle.distance * travel + progress * progress * 30;
      context.beginPath();
      context.fillStyle = `hsla(${particle.hue}, 88%, 52%, ${opacity})`;
      context.arc(px, py, particle.radius * (1 - progress * .35), 0, Math.PI * 2);
      context.fill();
    });
    if (active) requestAnimationFrame(drawFireworks);
    else overlay.remove();
  }
  // Keep the effect above the list when it is open, while letting clicks pass
  // through to its close and back-to-top buttons.
  (listDialog.open ? listDialog : document.body).appendChild(overlay);
  requestAnimationFrame(drawFireworks);
}

renderPlaceList();
listButton.addEventListener("click", () => {
  if (listDialog.open) {
    persistListReadingState(false);
    listDialog.close();
    return;
  }
  listDialog.showModal();
  requestAnimationFrame(() => { listContent.scrollTop = savedListScrollTop; });
});
document.getElementById("list-close").addEventListener("click", () => listDialog.close());
listDialog.addEventListener("click", (event) => {
  if (event.target === listDialog) {
    persistListReadingState(false);
    listDialog.close();
  }
});
document.getElementById("list-top").addEventListener("click", () => {
  listContent.scrollTo({ top: 0, behavior: "smooth" });
  savedListScrollTop = 0;
  try { sessionStorage.setItem(LIST_SCROLL_STORAGE_KEY, "0"); } catch (error) { /* The in-memory position remains available. */ }
});
listContent.addEventListener("scroll", () => {
  if (listDialog.open) persistListReadingState(true);
}, { passive: true });
listDialog.addEventListener("close", () => {
  try { sessionStorage.setItem(LIST_OPEN_STORAGE_KEY, "false"); } catch (error) { /* Ignore unavailable storage. */ }
});
listContent.addEventListener("click", (event) => {
  if (event.target.closest(".list-address a")) persistListReadingState(true);
});
window.addEventListener("pagehide", () => persistListReadingState(listDialog.open));
listSearch.addEventListener("input", () => {
  const query = listSearch.value.trim().toLocaleLowerCase("fr");
  listContent.querySelectorAll(".list-entry").forEach((entry) => {
    entry.hidden = Boolean(query) && !entry.dataset.search.includes(query);
  });
  listContent.querySelectorAll(".list-section").forEach((section) => {
    section.hidden = !section.querySelector(".list-entry:not([hidden])");
  });
});

try {
  if (sessionStorage.getItem(LIST_OPEN_STORAGE_KEY) === "true") {
    listDialog.showModal();
    requestAnimationFrame(() => { listContent.scrollTop = savedListScrollTop; });
  }
} catch (error) { /* Do not reopen automatically if session storage is unavailable. */ }

document.getElementById("btn-infos").addEventListener("click", () => {
  document.getElementById("infos").showModal();
});
document.getElementById("infos-close").addEventListener("click", () => document.getElementById("infos").close());

addMarkers();

const dataStatus = document.getElementById("data-status");
const dataButton = document.getElementById("download-offline-data");
const offlineBounds = { west: 121.20, south: 30.90, east: 121.90, north: 31.55 };

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" })[char]);
}

function downloadListExport() {
  const regularPlaces = PLACES.filter((place) => place.category !== "excursion");
  const districts = [...new Set(regularPlaces.map((place) => place.district || "Shanghai"))];
  const groups = districts.map((district) => [district, regularPlaces.filter((place) => (place.district || "Shanghai") === district)]);
  const excursions = excursionSorted(PLACES.filter((place) => place.category === "excursion"));
  if (excursions.length) groups.push(["Hors Shanghai", excursions]);
  const markup = groups.map(([district, places]) => `
    <section><h2>${escapeHtml(district)} · ${places.length} ${places.length === 1 ? "lieu" : "lieux"}</h2>
    ${places.map((place) => {
      const category = catById[place.category];
      const visited = visitedPlaces.has(place.id);
      const trip = place.branch ? `<p class="meta">${place.category === "excursion" ? "Temps de trajet" : "Adresse / antenne"} · ${escapeHtml(place.branch)}</p>` : "";
      const specialties = place.specialites ? `<p><b>Spécialités ·</b> ${escapeHtml(place.specialites)}</p>` : "";
      const practical = !["promenade", "nuit", "excursion"].includes(place.category)
        ? `<p class="practical"><b>Horaires / infos ·</b> ${escapeHtml(place.practical || "Horaires à vérifier auprès du lieu.")}</p>` : "";
      const address = place.address ? `<p><a href="${escapeHtml(place.amapUrl || "#")}">${escapeHtml(place.address)}</a></p>` : "";
      return `<article style="--entry-color:${escapeHtml(category?.color || "#c23b22")}"><h3><span class="check">${visited ? "☑" : "☐"}</span> ${escapeHtml(place.name)} <small>${escapeHtml(place.nameZh)}</small></h3>${trip}<p>${escapeHtml(getListDescription(place))}</p>${specialties}${address}${practical}</article>`;
    }).join("")}</section>`).join("");
  const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Shanghai · Liste des lieux</title><style>
    *{box-sizing:border-box}body{max-width:1000px;margin:24px auto;padding:0 20px;color:#24211e;background:#f4efe6;font:15px/1.5 system-ui,sans-serif}header{padding:8px 0 16px;border-bottom:3px solid #c23b22}h1{margin:0;color:#ad3023;font:700 28px Georgia,serif}section{margin:24px 0}section>h2{position:sticky;top:0;margin:0 0 10px;padding:10px;background:#f4efe6;border-bottom:1px solid #d8cec2;font-size:18px}article{margin:0 0 12px;padding:12px 14px;border-left:4px solid var(--entry-color);background:#fffaf2;break-inside:avoid}article h3{margin:0;color:#ad3023;font-size:16px}small{color:#777;font-weight:400}article p{margin:7px 0}.meta{color:#ad3023;font-size:13px}.practical{padding:8px 10px;background:#edf2f8;font-size:13px}a{color:#1a4f8b;overflow-wrap:anywhere}.check{color:#a52f22}@media print{body{margin:0 auto;background:white}section>h2{position:static}}
    </style></head><body><header><h1>Shanghai · Liste des lieux</h1><p>${PLACES.length} lieux · Cases cochées = déjà visités</p></header>${markup}</body></html>`;
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "shanghai-liste-des-lieux.html";
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 5000);
}

function openFreeMapProxyUrl(remoteUrl) {
  const proxy = new URL("ofm-proxy", document.baseURI);
  proxy.searchParams.set("url", remoteUrl);
  return proxy.href;
}

function tileY(latitude, zoom) {
  const radians = latitude * Math.PI / 180;
  return Math.floor((1 - Math.asinh(Math.tan(radians)) / Math.PI) / 2 * 2 ** zoom);
}

async function downloadOfflineMap(statusElement) {
  const mapResources = new Set(MAP_STYLE_URLS);
  const tileTemplates = new Set();

  for (const styleUrl of MAP_STYLE_URLS) {
    const styleResponse = await fetch(openFreeMapProxyUrl(styleUrl));
    if (!styleResponse.ok) throw new Error("Un style OpenFreeMap ne répond pas.");
    const style = await styleResponse.json();

    for (const source of Object.values(style.sources || {})) {
      if (source.tiles) source.tiles.forEach((template) => tileTemplates.add(template));
      if (source.url) {
        const sourceUrl = new URL(source.url, styleUrl).href;
        mapResources.add(sourceUrl);
        try {
          const sourceResponse = await fetch(openFreeMapProxyUrl(sourceUrl));
          if (sourceResponse.ok) {
            const tileJson = await sourceResponse.json();
            if (tileJson.tiles) tileJson.tiles.forEach((template) => tileTemplates.add(template));
          }
        } catch (error) { /* Continue if this source declares its tile templates directly. */ }
      }
    }

    if (style.sprite) {
      const sprite = new URL(style.sprite, styleUrl).href;
      for (const suffix of [".json", ".png", "@2x.json", "@2x.png"]) mapResources.add(sprite + suffix);
    }
  }

  for (const template of tileTemplates) {
    for (let zoom = 8; zoom <= 14; zoom++) {
      const n = 2 ** zoom;
      const xForLon = (longitude) => Math.floor((longitude + 180) / 360 * n);
      for (let x = xForLon(offlineBounds.west); x <= xForLon(offlineBounds.east); x++) {
        for (let y = tileY(offlineBounds.north, zoom); y <= tileY(offlineBounds.south, zoom); y++) {
          mapResources.add(template.replaceAll("{z}", zoom).replaceAll("{x}", x).replaceAll("{y}", y).replaceAll("{-y}", n - 1 - y));
        }
      }
    }
  }

  const urls = [...mapResources].map((url) => new URL(url, MAP_LIGHT_STYLE_URL).href)
    .filter((url) => url.startsWith("https://tiles.openfreemap.org/"));
  let completed = 0;
  let failed = 0;
  for (let i = 0; i < urls.length; i += 10) {
    const batch = urls.slice(i, i + 10);
    const results = await Promise.allSettled(batch.map(async (url) => {
      const response = await fetch(openFreeMapProxyUrl(url));
      if (!response.ok) throw new Error(`Ressource indisponible : ${url}`);
    }));
    failed += results.filter((result) => result.status === "rejected").length;
    completed += batch.length;
    statusElement.textContent = `Carte hors ligne : ${completed} / ${urls.length} ressources${failed ? ` · ${failed} échecs` : ""}`;
  }
  return { total: urls.length, failed };
}

async function downloadOfflinePhotos(statusElement) {
  const images = [...new Set(PLACES.map((place) => place.image).filter(Boolean))];
  let completed = 0;
  let failed = 0;
  for (let i = 0; i < images.length; i += 8) {
    const batch = images.slice(i, i + 8);
    const results = await Promise.allSettled(batch.map(async (path) => {
      const response = await fetch(new URL(path, document.baseURI));
      if (!response.ok) throw new Error(path);
    }));
    failed += results.filter((result) => result.status === "rejected").length;
    completed += batch.length;
    statusElement.textContent = `Photos hors ligne : ${completed} / ${images.length}${failed ? ` · ${failed} échec(s)` : ""}`;
  }
  return { total: images.length, failed };
}

dataButton.addEventListener("click", async () => {
  // Start the standalone list download directly from the user's click gesture.
  downloadListExport();
  if (!navigator.serviceWorker?.controller) {
    dataStatus.textContent = "La liste a été téléchargée. Ouvrez le site une première fois avec Internet, puis relancez pour télécharger photos et carte.";
    return;
  }
  dataButton.disabled = true;
  dataStatus.textContent = "Préparation de la liste, des photos et de la carte… gardez le site ouvert et connecté.";
  try {
    try { await navigator.storage?.persist?.(); } catch (error) { /* Storage persistence is optional. */ }
    const photos = await downloadOfflinePhotos(dataStatus);
    const mapResult = await downloadOfflineMap(dataStatus);
    const failures = photos.failed + mapResult.failed;
    dataStatus.textContent = failures
      ? `Liste téléchargée · ${photos.total - photos.failed}/${photos.total} photos · carte prête avec ${mapResult.total} ressources · ${failures} élément(s) manquant(s). Réessayez avec une connexion stable.`
      : `Liste téléchargée · ${photos.total} photos et cartes claire/sombre prêtes hors ligne (${mapResult.total} ressources).`;
  } catch (error) {
    dataStatus.textContent = `La liste a été téléchargée. Échec de préparation hors ligne : ${error.message || "connexion indisponible"}`;
  } finally {
    dataButton.disabled = false;
  }
});

// Keep the camera within the full area occupied by the listed places, plus 10 km.
const placeLatitudes = PLACES.map((place) => place.lat);
const placeLongitudes = PLACES.map((place) => place.lng);
const south = Math.min(...placeLatitudes);
const north = Math.max(...placeLatitudes);
const west = Math.min(...placeLongitudes);
const east = Math.max(...placeLongitudes);
const paddingLat = 10 / 111.32;
const paddingLng = 10 / (111.32 * Math.cos(((south + north) / 2) * Math.PI / 180));
map.setMaxBounds([
  [west - paddingLng, south - paddingLat],
  [east + paddingLng, north + paddingLat]
]);
