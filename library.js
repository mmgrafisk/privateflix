const KEY = "privateflix_items";
const GRID_KEY = "privateflix_grid_size";
let items = [];
let bookmarks = [];
let bookmarkTree = [];
let qualitySearchItem = null;
let qualityCandidate = null;

document.addEventListener("DOMContentLoaded", init);

async function init() {
  const stored = await chrome.storage.local.get(KEY);
  items = (stored[KEY] || []).map((item) => ({ ...item, alternatives: Array.isArray(item.alternatives) ? item.alternatives : [] }));
  const settings = await chrome.storage.local.get(GRID_KEY);
  document.querySelector("#gridSize").value = String(settings[GRID_KEY] || 5);
  bindEvents();
  applyGridSize();
  render();
}

function bindEvents() {
  ["search", "siteFilter", "categoryFilter", "performerFilter", "studioFilter", "statusFilter", "sort"].forEach((id) => document.querySelector(`#${id}`).addEventListener("input", render));
  document.querySelector("#gridSize").addEventListener("change", applyGridSize);
  document.querySelector("#menuButton").addEventListener("click", (event) => { event.stopPropagation(); toggleHeaderMenu(); });
  document.querySelector("#headerMenu").addEventListener("click", (event) => event.stopPropagation());
  document.addEventListener("click", closeHeaderMenu);
  document.addEventListener("keydown", (event) => { if (event.key === "Escape") closeHeaderMenu(true); });
  document.querySelector("#importBookmarks").addEventListener("click", () => { closeHeaderMenu(); openImport(); });
  document.querySelector("#refreshMetadata").addEventListener("click", () => { closeHeaderMenu(); refreshMetadata(); });
  document.querySelector("#bookmarkSearch").addEventListener("input", renderBookmarks);
  document.querySelector("#selectAll").addEventListener("click", () => toggleVisible(true));
  document.querySelector("#selectNone").addEventListener("click", () => toggleVisible(false));
  document.querySelector("#confirmImport").addEventListener("click", importSelected);
  document.querySelector("#backup").addEventListener("click", () => { closeHeaderMenu(); exportBackup(); });
  document.querySelector("#restore").addEventListener("change", restoreBackup);
  document.querySelector("#restoreButton").addEventListener("click", () => { closeHeaderMenu(); document.querySelector("#restore").click(); });
  document.querySelector("#resetFilters").addEventListener("click", resetFilters);
  document.querySelector("#saveEdit").addEventListener("click", saveEdit);
  document.querySelectorAll("[data-quality]").forEach((node) => node.addEventListener("click", () => runQualitySearch(node.dataset.quality)));
  document.querySelector("#analyzeCandidate").addEventListener("click", analyzeCandidate);
  document.querySelector("#candidateUrl").addEventListener("keydown", (event) => { if (event.key === "Enter") { event.preventDefault(); analyzeCandidate(); } });
  document.querySelector("#saveAlternative").addEventListener("click", saveCandidateAsAlternative);
  document.querySelector("#replaceVersion").addEventListener("click", replaceWithCandidate);
}

function toggleHeaderMenu() {
  const button = document.querySelector("#menuButton");
  const menu = document.querySelector("#headerMenu");
  const open = menu.hidden;
  menu.hidden = !open;
  button.setAttribute("aria-expanded", String(open));
  if (open) menu.querySelector('[role="menuitem"]')?.focus();
}

function closeHeaderMenu(returnFocus = false) {
  const button = document.querySelector("#menuButton");
  const menu = document.querySelector("#headerMenu");
  if (menu.hidden) return;
  menu.hidden = true;
  button.setAttribute("aria-expanded", "false");
  if (returnFocus) button.focus();
}

function filteredItems() {
  const query = document.querySelector("#search").value.toLowerCase().trim();
  const site = document.querySelector("#siteFilter").value;
  const status = document.querySelector("#statusFilter").value;
  const category = document.querySelector("#categoryFilter").value;
  const performer = document.querySelector("#performerFilter").value;
  const studio = document.querySelector("#studioFilter").value;
  const sort = document.querySelector("#sort").value;
  const result = items.filter((item) => {
    const videoTags = [...(item.categories || []), ...(item.tags || [])];
    const haystack = [item.title, item.site, item.studio, ...videoTags, ...(item.performers || [])].join(" ").toLowerCase();
    return (!query || haystack.includes(query)) && (!site || item.site === site) && (!category || videoTags.includes(category)) && (!performer || (item.performers || []).includes(performer)) && (!studio || item.studio === studio) && (!status || (status === "favorite" ? item.favorite : item.status === status));
  });
  return result.sort((a, b) => {
    if (sort === "title") return a.title.localeCompare(b.title, "da");
    if (sort === "recently-opened") return compareDatesLast(a.lastOpenedAt, b.lastOpenedAt);
    if (sort === "oldest") return new Date(a.createdAt) - new Date(b.createdAt);
    if (sort === "duration-desc") return compareKnownValues(a.duration, b.duration, durationSeconds, "desc");
    if (sort === "duration-asc") return compareKnownValues(a.duration, b.duration, durationSeconds, "asc");
    if (sort === "quality-desc") return compareKnownValues(a.quality, b.quality, qualityScore, "desc");
    if (sort === "quality-asc") return compareKnownValues(a.quality, b.quality, qualityScore, "asc");
    return new Date(b.createdAt) - new Date(a.createdAt);
  });
}

function compareDatesLast(a, b) {
  const aTime = Date.parse(a || ""); const bTime = Date.parse(b || "");
  const aUnknown = !Number.isFinite(aTime); const bUnknown = !Number.isFinite(bTime);
  if (aUnknown !== bUnknown) return aUnknown ? 1 : -1;
  return bTime - aTime;
}

function compareKnownValues(a, b, score, direction) {
  const aScore = score(a); const bScore = score(b);
  const aUnknown = !aScore; const bUnknown = !bScore;
  if (aUnknown !== bUnknown) return aUnknown ? 1 : -1;
  return direction === "desc" ? bScore - aScore : aScore - bScore;
}

async function applyGridSize() { const value = Number(document.querySelector("#gridSize").value) || 5; document.querySelector("#grid").style.setProperty("--columns", value); await chrome.storage.local.set({ [GRID_KEY]: value }); }

function render() {
  refreshFilterOptions();
  const visible = filteredItems();
  document.querySelector("#count").textContent = `${visible.length} ${visible.length === 1 ? "film" : "film"}`;
  document.querySelector("#statTotal").textContent = items.length;
  document.querySelector("#statFavorites").textContent = items.filter((item) => item.favorite).length;
  document.querySelector("#statWatched").textContent = items.filter((item) => item.status === "watched").length;
  document.querySelector("#statAlternatives").textContent = items.reduce((total, item) => total + (item.alternatives || []).length, 0);
  document.querySelector("#empty").hidden = items.length !== 0;
  document.querySelector("#noResults").hidden = items.length === 0 || visible.length !== 0;
  const grid = document.querySelector("#grid");
  grid.replaceChildren(...visible.map(card));
}

function card(item) {
  const unavailable = item.availability === "removed";
  const article = el("article", `video-card${unavailable ? " video-card-unavailable" : ""}`);
  const link = el(unavailable ? "div" : "a", "poster");
  if (!unavailable) { link.href = item.url; link.target = "_blank"; link.rel = "noopener"; link.addEventListener("click", () => markOpened(item.id)); }
  if (item.thumbnail) { const img = new Image(); img.src = item.thumbnail; img.alt = ""; img.referrerPolicy = "no-referrer"; img.onerror = () => posterFallback(link, item); link.append(img); }
  else posterFallback(link, item);
  const previewSources = (Array.isArray(item.previewUrl) ? item.previewUrl : [item.previewUrl]).filter(isPlayablePreviewUrl);
  if (!unavailable && previewSources.length) installHoverPreview(link, previewSources, async () => { item.previewUrl = ""; await persist(); installLazyPreview(link, item); });
  else if (!unavailable) installLazyPreview(link, item);
  if ((item.alternatives || []).length) link.append(el("span", "version-badge", `+${item.alternatives.length} version${item.alternatives.length === 1 ? "" : "er"}`));
  if (unavailable) {
    const removed = el("div", "removed-poster-message");
    removed.append(el("strong", "", "Videoen er fjernet"), el("span", "", "Kilden viser, at videoen ikke findes"));
    link.append(removed);
  } else link.append(el("span", "play", "▶"));
  const body = el("div", "card-body");
  const site = siteIdentity(item);
  const title = el(unavailable ? "span" : "a", "card-title", item.title);
  if (!unavailable) { title.href = item.url; title.target = "_blank"; title.rel = "noopener"; title.addEventListener("click", () => markOpened(item.id)); }
  const facts = el("div", "card-facts");
  facts.append(cardFact("◷", item.duration ? formatDuration(item.duration) : "--:--", "duration", `Længde: ${item.duration ? formatDuration(item.duration) : "ukendt"}`), cardFact("", item.quality ? normalizeQuality(item.quality) : "—", "quality", `Maksimumkvalitet: ${item.quality ? normalizeQuality(item.quality) : "ukendt"}`));
  const metadataDetails = cardMetadataDetails(item);
  const actions = el("div", "card-actions");
  const fav = button(item.favorite ? "★" : "☆", item.favorite ? "Fjern favorit" : "Markér favorit", () => update(item.id, { favorite: !item.favorite }));
  const better = button(unavailable ? "Søg efter videoen et andet sted" : (item.alternatives || []).length ? `⇧ Versioner (${item.alternatives.length + 1})` : "↗ Find bedre", "Sammenlign og administrér versioner", () => openQualitySearch(item), "better-quality");
  const edit = button("Redigér", "Redigér", () => openEdit(item));
  const remove = button("Slet", "Slet", () => removeItem(item.id), "danger");
  if (unavailable) {
    const removedText = el("div", "removed-card-message");
    removedText.append(el("strong", "", "Videoen ser ud til at være slettet."), el("span", "", "Vil du søge efter den et andet sted?"));
    actions.append(better, edit, remove); body.append(site, title, facts, metadataDetails, removedText, actions);
  } else { actions.append(better, fav, edit, remove); body.append(site, title, facts, metadataDetails, actions); }
  article.append(link, body); return article;
}

function cardMetadataDetails(item) {
  const details = el("div", "card-metadata");
  const studioRow = el("div", "credit-row studio-row"); studioRow.append(el("span", "credit-label", "Studio"));
  if (item.studio) studioRow.append(filterPill(item.studio, "studioFilter", "credit-button studio-button"));
  else studioRow.append(el("span", "credit-missing", "Ukendt"));
  details.append(studioRow);
  if ((item.performers || []).length) {
    const row = el("div", "credit-row"); row.append(el("span", "credit-label", "Medvirkende"));
    const list = el("div", "credit-list"); (item.performers || []).forEach((name) => list.append(filterPill(name, "performerFilter", "credit-button"))); row.append(list); details.append(row);
  }
  const videoTags = [...new Set([...(item.categories || []), ...(item.tags || [])])].slice(0, 10);
  if (videoTags.length) {
    const row = el("div", "tags-section"); row.append(el("span", "credit-label", "Tags"));
    const list = el("div", "tag-row"); videoTags.forEach((tag) => list.append(filterPill(tag, "categoryFilter", "tag tag-button"))); row.append(list); details.append(row);
  }
  return details;
}

function filterPill(text, filterId, className) {
  const node = el("button", className, text); node.type = "button"; node.title = `Filtrér efter ${text}`;
  if (document.querySelector(`#${filterId}`)?.value === text) node.classList.add("filter-pill-active");
  node.addEventListener("click", () => { const filter = document.querySelector(`#${filterId}`); filter.value = filter.value === text ? "" : text; render(); });
  return node;
}

function cardFact(icon, value, extra = "", accessibleLabel = "") {
  const fact = el("div", `card-fact ${extra}`.trim());
  if (accessibleLabel) fact.setAttribute("aria-label", accessibleLabel);
  if (icon) fact.append(el("span", "card-fact-icon", icon));
  fact.append(el("strong", "", value));
  return fact;
}

function siteIdentity(item) {
  const row = el("div", "site-row");
  const logo = el("span", "site-logo", String(item.site || "?").charAt(0));
  const iconUrl = item.siteIcon || defaultSiteIcon(item.url);
  if (iconUrl) {
    const image = new Image(); image.alt = ""; image.referrerPolicy = "no-referrer";
    image.addEventListener("load", () => { logo.textContent = ""; logo.append(image); }, { once: true });
    image.src = iconUrl;
  }
  row.append(logo, el("span", "site-label", item.site || safeHost(item.url)));
  return row;
}

async function markOpened(id) {
  const item = items.find((entry) => entry.id === id);
  if (!item) return;
  item.lastOpenedAt = new Date().toISOString();
  await persist();
}

function cleanSearchTitle(item) {
  let title = String(item.title || "").trim();
  const siteWords = String(item.site || "").replace(/\.[a-z]{2,}$/i, "").split(/[.-]/).filter((word) => word.length > 2);
  siteWords.forEach((word) => { title = title.replace(new RegExp(`\\s*[-|–—:]?\\s*${escapeRegExp(word)}\\s*$`, "i"), "").trim(); });
  return title.replace(/\s+/g, " ").slice(0, 180);
}
function escapeRegExp(value) { return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
function openQualitySearch(item) {
  qualitySearchItem = items.find((entry) => entry.id === item.id) || item;
  qualityCandidate = null;
  document.querySelector("#qualityTitle").textContent = cleanSearchTitle(item) || item.title;
  document.querySelector("#qualityCurrent").textContent = [item.quality ? `Nuværende: ${normalizeQuality(item.quality)}` : "Nuværende kvalitet: ukendt", item.duration ? `Længde: ${formatDuration(item.duration)}` : ""].filter(Boolean).join(" · ");
  document.querySelector("#candidateUrl").value = "";
  setCandidateStatus("");
  document.querySelector("#candidateComparison").hidden = true;
  document.querySelector("#candidateActions").hidden = true;
  renderAlternatives();
  document.querySelector("#qualityDialog").showModal();
}
function runQualitySearch(target) {
  if (!qualitySearchItem) return;
  const item = qualitySearchItem;
  const title = cleanSearchTitle(item);
  const terms = [title ? `\"${title}\"` : item.title, (item.performers || []).slice(0, 2).join(" ")];
  if (target === "same-site") terms.push(`site:${item.site}`);
  else if (target === "1080p") terms.push("1080p OR 1440p OR 2160p OR 4K");
  else if (target === "4K") terms.push("4K OR 2160p OR UHD");
  else if (target === "8K") terms.push("8K OR 4320p");
  else terms.push("full video");
  window.open(`https://www.google.com/search?q=${encodeURIComponent(terms.filter(Boolean).join(" "))}`, "_blank", "noopener");
}

async function analyzeCandidate() {
  if (!qualitySearchItem) return;
  const input = document.querySelector("#candidateUrl");
  const url = input.value.trim();
  if (!isHttpUrl(url)) { setCandidateStatus("Indsæt et gyldigt http- eller https-link.", true); return; }
  const duplicate = [qualitySearchItem, ...(qualitySearchItem.alternatives || [])].some((version) => normalize(version.url) === normalize(url));
  if (duplicate) { setCandidateStatus("Linket er allerede gemt som en version af filmen.", true); return; }
  const button = document.querySelector("#analyzeCandidate");
  button.disabled = true; button.textContent = "Henter…"; setCandidateStatus("Henter titel, længde og kvalitet…");
  document.querySelector("#candidateComparison").hidden = true;
  document.querySelector("#candidateActions").hidden = true;
  try {
    const metadata = await chrome.runtime.sendMessage({ type: "FETCH_METADATA", url }) || {};
    if (metadata.removed) { qualityCandidate = null; setCandidateStatus("Kandidatlinket er også slettet eller ikke længere tilgængeligt.", true); return; }
    qualityCandidate = versionSnapshot({
      id: crypto.randomUUID(),
      title: metadata.title || "Uden titel",
      url,
      site: safeHost(url),
      siteIcon: metadata.siteIcon || defaultSiteIcon(url),
      thumbnail: metadata.thumbnail || "",
      previewUrl: metadata.previewUrl || "",
      categories: metadata.categories || [],
      performers: metadata.performers || [],
      studio: metadata.studio || "",
      duration: metadata.duration || "",
      quality: metadata.quality || "",
      publishedAt: metadata.publishedAt || "",
      metadataError: metadata.error || "",
      availability: metadata.available ? "active" : "unknown",
      lastCheckedAt: metadata.checkedAt || "",
      addedAt: new Date().toISOString()
    });
    renderCandidateComparison();
    document.querySelector("#candidateActions").hidden = false;
    setCandidateStatus(metadata.ok === false ? "Siden blokerede nogle metadata. Kontrollér kandidaten manuelt før du erstatter." : "Kandidaten er klar til sammenligning.", metadata.ok === false);
  } catch {
    qualityCandidate = null;
    setCandidateStatus("Kandidaten kunne ikke analyseres. Prøv igen eller gem linket via den åbne side.", true);
  } finally {
    button.disabled = false; button.textContent = "Analysér";
  }
}

function setCandidateStatus(text, error = false) {
  const node = document.querySelector("#candidateStatus");
  node.textContent = text; node.classList.toggle("error", error);
}

function versionSnapshot(source) {
  return {
    id: source.id || crypto.randomUUID(),
    title: source.title || "Uden titel",
    url: source.url,
    site: source.site || safeHost(source.url),
    siteIcon: source.siteIcon || defaultSiteIcon(source.url),
    thumbnail: source.thumbnail || "",
    previewUrl: source.previewUrl || "",
    categories: [...(source.categories || [])],
    performers: [...(source.performers || [])],
    duration: source.duration || "",
    quality: source.quality || "",
    studio: source.studio || "",
    publishedAt: source.publishedAt || "",
    metadataError: source.metadataError || "",
    availability: ["active", "removed", "unknown"].includes(source.availability) ? source.availability : "unknown",
    lastCheckedAt: Number.isFinite(Date.parse(source.lastCheckedAt || "")) ? source.lastCheckedAt : "",
    addedAt: source.addedAt || source.createdAt || new Date().toISOString()
  };
}

function renderCandidateComparison() {
  if (!qualityCandidate || !qualitySearchItem) return;
  const current = qualitySearchItem; const candidate = qualityCandidate;
  const score = matchConfidence(current, candidate);
  const label = score >= 75 ? "Stærkt match" : score >= 50 ? "Muligt match" : "Usikkert match";
  const pillClass = score >= 75 ? "good" : score >= 50 ? "warning" : "";
  const header = el("div", "comparison-score");
  header.append(el("strong", "", "Sammenligning"), el("span", `match-pill ${pillClass}`, `${label} · ${score}%`));
  const comparison = document.querySelector("#candidateComparison");
  comparison.replaceChildren(
    header,
    comparisonRow("Titel", current.title, candidate.title),
    comparisonRow("Hjemmeside", current.site, candidate.site),
    comparisonRow("Studio", current.studio || "Ukendt", candidate.studio || "Ukendt"),
    comparisonRow("Længde", current.duration ? formatDuration(current.duration) : "Ukendt", candidate.duration ? formatDuration(candidate.duration) : "Ukendt", durationSeconds(candidate.duration) > durationSeconds(current.duration)),
    comparisonRow("Kvalitet", current.quality ? normalizeQuality(current.quality) : "Ukendt", candidate.quality ? normalizeQuality(candidate.quality) : "Ukendt", qualityScore(candidate.quality) > qualityScore(current.quality))
  );
  comparison.hidden = false;
}

function comparisonRow(label, current, candidate, better = false) {
  const row = el("div", "comparison-row");
  const candidateValue = el("strong", better ? "better-value" : "", candidate || "Ukendt");
  row.append(el("span", "", label), el("strong", "", current || "Ukendt"), candidateValue);
  return row;
}

function matchConfidence(current, candidate) {
  const parts = [];
  if (current.title && candidate.title && candidate.title !== "Uden titel") parts.push([titleSimilarity(current.title, candidate.title), 70]);
  const currentPerformers = normalizedSet(current.performers || []); const candidatePerformers = normalizedSet(candidate.performers || []);
  if (currentPerformers.size && candidatePerformers.size) parts.push([setOverlap(currentPerformers, candidatePerformers), 15]);
  const currentDuration = durationSeconds(current.duration); const candidateDuration = durationSeconds(candidate.duration);
  if (currentDuration && candidateDuration) parts.push([Math.max(0, 1 - Math.abs(currentDuration - candidateDuration) / Math.max(currentDuration, candidateDuration)), 15]);
  const weight = parts.reduce((total, part) => total + part[1], 0);
  return weight ? Math.round(parts.reduce((total, [value, partWeight]) => total + value * partWeight, 0) / weight * 100) : 0;
}

function titleSimilarity(a, b) {
  const ignored = new Set(["video", "full", "official", "watch", "free", "porno", "porn", "hd", "uhd", "4k", "8k", "1080p", "2160p"]);
  const tokens = (value) => new Set(String(value).normalize("NFKD").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").split(/\s+/).filter((word) => word.length > 1 && !ignored.has(word)));
  return setOverlap(tokens(a), tokens(b));
}
function normalizedSet(values) { return new Set(values.map((value) => String(value).trim().toLowerCase()).filter(Boolean)); }
function setOverlap(a, b) { if (!a.size || !b.size) return 0; const intersection = [...a].filter((value) => b.has(value)).length; return intersection / new Set([...a, ...b]).size; }

async function saveCandidateAsAlternative() {
  if (!qualityCandidate || !qualitySearchItem) return;
  qualitySearchItem.alternatives = dedupeVersions([...(qualitySearchItem.alternatives || []), qualityCandidate]);
  await persist();
  qualityCandidate = null; document.querySelector("#candidateUrl").value = "";
  document.querySelector("#candidateComparison").hidden = true; document.querySelector("#candidateActions").hidden = true;
  setCandidateStatus("Alternativet er gemt."); renderAlternatives(); render();
}

async function replaceWithCandidate() {
  if (!qualityCandidate || !qualitySearchItem) return;
  const score = matchConfidence(qualitySearchItem, qualityCandidate);
  if (score < 50 && !confirm("Kandidaten er et usikkert match. Vil du stadig gøre den til foretrukken version?")) return;
  const previous = versionSnapshot(qualitySearchItem);
  const alternatives = dedupeVersions([...(qualitySearchItem.alternatives || []), previous]).filter((version) => normalize(version.url) !== normalize(qualityCandidate.url));
  replacePrimaryData(qualitySearchItem, qualityCandidate, alternatives);
  await persist(); render(); document.querySelector("#qualityDialog").close();
}

function replacePrimaryData(item, version, alternatives) {
  const preserved = { id:item.id, tags:item.tags || [], status:item.status, favorite:item.favorite, createdAt:item.createdAt, lastOpenedAt:item.lastOpenedAt };
  Object.assign(item, versionSnapshot(version), preserved, { alternatives });
}

function dedupeVersions(versions) {
  const seen = new Set();
  return versions.filter((version) => {
    const key = normalize(version.url); if (!key || seen.has(key)) return false; seen.add(key); return true;
  });
}

function renderAlternatives() {
  if (!qualitySearchItem) return;
  const alternatives = qualitySearchItem.alternatives || [];
  document.querySelector("#alternativesCount").textContent = `${alternatives.length} gemt`;
  const list = document.querySelector("#alternativeList");
  if (!alternatives.length) { list.replaceChildren(el("div", "alternative-empty", "Ingen alternative versioner gemt endnu.")); return; }
  list.replaceChildren(...alternatives.map((version) => {
    const row = el("div", "alternative-row");
    const content = el("div"); const link = el("a", "", version.title || version.site); link.href = version.url; link.target = "_blank"; link.rel = "noopener";
    content.append(link, el("div", "alternative-meta", [version.site, version.duration ? formatDuration(version.duration) : "", version.quality ? normalizeQuality(version.quality) : ""].filter(Boolean).join(" · ")));
    const actions = el("div", "alternative-actions");
    actions.append(button("Brug", "Gør til foretrukken version", () => promoteAlternative(version.id)), button("Slet", "Fjern alternativ", () => deleteAlternative(version.id), "danger"));
    row.append(content, actions); return row;
  }));
}

async function promoteAlternative(versionId) {
  if (!qualitySearchItem) return;
  const alternative = (qualitySearchItem.alternatives || []).find((version) => version.id === versionId); if (!alternative) return;
  const previous = versionSnapshot(qualitySearchItem);
  const remaining = (qualitySearchItem.alternatives || []).filter((version) => version.id !== versionId);
  replacePrimaryData(qualitySearchItem, alternative, dedupeVersions([...remaining, previous]));
  await persist(); render(); document.querySelector("#qualityDialog").close();
}

async function deleteAlternative(versionId) {
  if (!qualitySearchItem || !confirm("Vil du fjerne denne alternative version?")) return;
  qualitySearchItem.alternatives = (qualitySearchItem.alternatives || []).filter((version) => version.id !== versionId);
  await persist(); renderAlternatives(); render();
}

function installHoverPreview(container, source, onFailure) {
  let video;
  let hoverTimer;
  let previewSession = 0;
  const sources = (Array.isArray(source) ? source : [source]).filter(isPlayablePreviewUrl);
  if (!sources.length) return;
  container.classList.add("has-preview");
  const destroyVideo = () => {
    if (!video) return;
    video.pause();
    video.removeAttribute("src");
    video.querySelectorAll("source").forEach((node) => node.removeAttribute("src"));
    video.load();
    video.remove();
    video = null;
    container.classList.remove("preview-playing");
  };
  const start = () => {
    const session = ++previewSession;
    clearTimeout(hoverTimer);
    hoverTimer = setTimeout(() => {
      if (session !== previewSession || video) return;
      document.querySelectorAll(".hover-preview").forEach((other) => other.closest(".poster")?._stopPreview?.());
      video = document.createElement("video");
      video.className = "hover-preview";
      video.muted = true;
      video.defaultMuted = true;
      video.loop = true;
      video.playsInline = true;
      video.preload = "metadata";
      video.referrerPolicy = "no-referrer";
      sources.filter(Boolean).forEach((url) => { const sourceNode = document.createElement("source"); sourceNode.src = url; video.append(sourceNode); });
      video.addEventListener("playing", () => container.classList.add("preview-playing"), { once: true });
      video.addEventListener("canplay", () => { if (session === previewSession) video?.play().catch(destroyVideo); }, { once: true });
      video.addEventListener("error", () => { container.classList.remove("has-preview"); destroyVideo(); detach(); onFailure?.(); }, { once: true });
      container.prepend(video);
      video.play().catch(() => {});
    }, 220);
  };
  const stop = () => { previewSession++; clearTimeout(hoverTimer); destroyVideo(); };
  const detach = () => { container.removeEventListener("mouseenter", start); container.removeEventListener("mouseleave", stop); container.removeEventListener("focus", start); container.removeEventListener("blur", stop); };
  container._startPreview = start;
  container._stopPreview = stop;
  container.addEventListener("mouseenter", start); container.addEventListener("mouseleave", stop); container.addEventListener("focus", start); container.addEventListener("blur", stop);
}

function installLazyPreview(container, item) {
  let timer; let hovered = false; let attempted = false;
  const cleanup = () => {
    clearTimeout(timer);
    container.removeEventListener("mouseenter", enter);
    container.removeEventListener("mouseleave", leave);
    container.removeEventListener("focus", enter);
    container.removeEventListener("blur", leave);
  };
  const enter = () => {
    hovered = true;
    if (attempted) { container.classList.add("cover-preview"); return; }
    clearTimeout(timer);
    timer = setTimeout(async () => {
      if (attempted) return;
      attempted = true;
      container.classList.add("preview-loading");
      try {
        const metadata = await chrome.runtime.sendMessage({ type:"FETCH_METADATA", url:item.url }) || {};
        if (metadata.removed) {
          item.availability = "removed"; item.lastCheckedAt = metadata.checkedAt || new Date().toISOString();
          await persist(); render(); return;
        }
        if (metadata.available) {
          item.availability = "active"; item.lastCheckedAt = metadata.checkedAt || new Date().toISOString();
          if (metadata.thumbnail && !item.thumbnail) item.thumbnail = metadata.thumbnail;
          if (metadata.categories?.length) item.categories = [...new Set([...(item.categories || []), ...metadata.categories])];
          if (metadata.performers?.length) item.performers = [...new Set([...(item.performers || []), ...metadata.performers])];
          if (metadata.studio) item.studio = metadata.studio;
          if (metadata.duration && !item.duration) item.duration = metadata.duration;
          if (metadata.quality && qualityScore(metadata.quality) > qualityScore(item.quality)) item.quality = metadata.quality;
        }
        const sources = (Array.isArray(metadata.previewUrl) ? metadata.previewUrl : [metadata.previewUrl]).filter(isPlayablePreviewUrl);
        if (sources.length) {
          item.previewUrl = sources.length > 1 ? sources : sources[0];
          await persist(); cleanup(); installHoverPreview(container, sources, () => container.classList.add("preview-fallback"));
          if (hovered) container._startPreview?.();
        } else {
          if (metadata.available) await persist();
          container.classList.add("preview-fallback", "cover-preview");
        }
      } catch { container.classList.add("preview-fallback", "cover-preview"); }
      finally { container.classList.remove("preview-loading"); }
    }, 260);
  };
  const leave = () => { hovered = false; clearTimeout(timer); container.classList.remove("cover-preview"); };
  container.classList.add("preview-discoverable");
  container.addEventListener("mouseenter", enter); container.addEventListener("mouseleave", leave); container.addEventListener("focus", enter); container.addEventListener("blur", leave);
}

function isPlayablePreviewUrl(value) {
  if (!value || !/^https?:\/\//i.test(value)) return false;
  try {
    const path = new URL(value).pathname.toLowerCase();
    if (/\.(?:jpe?g|png|gif|webp|avif|svg|html?|php)(?:$|\/)/i.test(path)) return false;
    return !/(?:^|\/)embed(?:\/|$)|(?:^|\/)player(?:\/|$)/i.test(path);
  } catch { return false; }
}

function durationSeconds(value) { if (typeof value === "number") return value; const text = String(value || "").trim(); const iso = text.match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?$/i); if (iso) return Number(iso[1] || 0) * 3600 + Number(iso[2] || 0) * 60 + Number(iso[3] || 0); const parts = text.split(":").map(Number); if (parts.every(Number.isFinite)) return parts.reduce((total, part) => total * 60 + part, 0); const numeric = Number(text); return Number.isFinite(numeric) ? numeric : 0; }
function formatDuration(value) { const total = Math.round(durationSeconds(value)); if (!total) return String(value); const h = Math.floor(total / 3600); const m = Math.floor((total % 3600) / 60); const s = total % 60; return h ? `${h}:${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}` : `${m}:${String(s).padStart(2,"0")}`; }
function qualityScore(value) { const text = String(value || "").toLowerCase(); if (/8k|4320/.test(text)) return 4320; if (/4k|2160|uhd/.test(text)) return 2160; if (/1440|2k|qhd/.test(text)) return 1440; const match = text.match(/(\d{3,4})p?/); return Number(match?.[1] || 0); }
function normalizeQuality(value) { const score = qualityScore(value); return score >= 2160 ? (score >= 4320 ? "8K" : "4K") : score ? `${score}p` : String(value); }

function posterFallback(container, item) { container.querySelector("img")?.remove(); const fallback = el("div", "poster-fallback", item.site.slice(0, 1).toUpperCase()); container.prepend(fallback); }
function el(tag, className, text) { const node = document.createElement(tag); if (className) node.className = className; if (text !== undefined) node.textContent = text; return node; }
function button(text, label, handler, extra = "") { const node = el("button", `mini-button ${extra}`, text); node.type = "button"; node.title = label; node.addEventListener("click", handler); return node; }

async function update(id, changes) { items = items.map((item) => item.id === id ? { ...item, ...changes } : item); await persist(); render(); }
async function removeItem(id) { if (!confirm("Vil du slette dette link fra biblioteket?")) return; items = items.filter((item) => item.id !== id); await persist(); render(); }
async function persist() { await chrome.storage.local.set({ [KEY]: items }); }

function refreshFilterOptions() {
  fillSelect("siteFilter", "Alle hjemmesider", items.map((item) => item.site));
  fillSelect("categoryFilter", "Alle tags", items.flatMap((item) => [...(item.categories || []), ...(item.tags || [])]));
  fillSelect("performerFilter", "Alle performers", items.flatMap((item) => item.performers || []));
  fillSelect("studioFilter", "Alle selskaber", items.map((item) => item.studio));
}
function fillSelect(id, label, values) {
  const select = document.querySelector(`#${id}`); const previous = select.value;
  const unique = [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b, "da"));
  select.replaceChildren(new Option(label, ""), ...unique.map((value) => new Option(value, value))); select.value = previous;
}

async function openImport() {
  const tree = await chrome.bookmarks.getTree(); bookmarkTree = tree; bookmarks = flatten(tree).filter((entry) => entry.url?.startsWith("http")).map((entry) => ({ ...entry, selected: false }));
  document.querySelector("#bookmarkSearch").value = ""; renderBookmarks(); document.querySelector("#importDialog").showModal();
}
function flatten(nodes, output = []) { for (const node of nodes) { output.push(node); if (node.children) flatten(node.children, output); } return output; }
function visibleBookmarks() { const q = document.querySelector("#bookmarkSearch").value.toLowerCase(); return bookmarks.filter((b) => !q || `${b.title} ${b.url}`.toLowerCase().includes(q)); }
function renderBookmarks() {
  const list = document.querySelector("#bookmarkList");
  const q = document.querySelector("#bookmarkSearch").value.toLowerCase().trim();
  list.replaceChildren(...bookmarkTree.flatMap((node) => renderBookmarkNode(node, q, 0)).filter(Boolean)); updateSelectedCount();
}
function renderBookmarkNode(node, query, depth) {
  const children = node.children || [];
  const titleMatches = !query || (node.title || "Bogmærker").toLowerCase().includes(query);
  const matchingChildren = children.flatMap((child) => renderBookmarkNode(child, titleMatches ? "" : query, depth + 1)).filter(Boolean);
  if (node.url) {
    if (!node.url.startsWith("http") || (query && !`${node.title} ${node.url}`.toLowerCase().includes(query))) return [];
    const bookmark = bookmarks.find((b) => b.id === node.id); if (!bookmark) return [];
    const label = el("label", "bookmark-row bookmark-item"); label.style.setProperty("--depth", depth); label.dataset.bookmarkId = node.id;
    const input = document.createElement("input"); input.type = "checkbox"; input.checked = bookmark.selected;
    input.addEventListener("change", () => { bookmark.selected = input.checked; updateSelectedCount(); });
    const text = el("span"); text.append(el("strong", "", node.title || "Uden titel"), el("small", "", safeHost(node.url))); label.append(input, text); return [label];
  }
  const descendantIds = flatten(children).filter((x) => x.url?.startsWith("http")).map((x) => x.id);
  if (query && !titleMatches && !matchingChildren.length) return [];
  const details = el("details", "bookmark-folder"); details.open = depth < 2 || Boolean(query); details.style.setProperty("--depth", depth);
  const summary = el("summary", "folder-summary"); const checkbox = document.createElement("input"); checkbox.type = "checkbox";
  const selected = descendantIds.filter((id) => bookmarks.find((b) => b.id === id)?.selected).length; checkbox.checked = descendantIds.length > 0 && selected === descendantIds.length; checkbox.indeterminate = selected > 0 && selected < descendantIds.length;
  checkbox.addEventListener("click", (event) => event.stopPropagation()); checkbox.addEventListener("change", () => { bookmarks.forEach((b) => { if (descendantIds.includes(b.id)) b.selected = checkbox.checked; }); renderBookmarks(); });
  summary.append(checkbox, el("span", "folder-icon", "▸"), el("strong", "", node.title || "Bogmærker"), el("small", "", `${descendantIds.length} links`));
  details.append(summary, ...matchingChildren); return [details];
}
function toggleVisible(selected) { const ids = new Set([...document.querySelectorAll("#bookmarkList .bookmark-item[data-bookmark-id]")].map((node) => node.dataset.bookmarkId)); bookmarks.forEach((b) => { if (ids.has(b.id)) b.selected = selected; }); renderBookmarks(); }
function updateSelectedCount() { document.querySelector("#selectedCount").textContent = `${bookmarks.filter((b) => b.selected).length} valgt`; }
async function importSelected(event) {
  event.preventDefault(); const existing = new Set(items.map((i) => normalize(i.url))); let added = 0; let failed = 0; let completed = 0; const button = document.querySelector("#confirmImport"); button.disabled = true;
  const queue = bookmarks.filter((b) => b.selected).filter((bookmark) => { const key = normalize(bookmark.url); if (existing.has(key)) return false; existing.add(key); return true; });
  try {
    await runPool(queue, 3, async (bookmark) => {
      const metadata = await chrome.runtime.sendMessage({ type: "FETCH_METADATA", url: bookmark.url }) || {};
      if (metadata.ok === false && !metadata.removed) failed++;
      items.push({ id: crypto.randomUUID(), title: metadata.title || bookmark.title || "Uden titel", url: bookmark.url, site: safeHost(bookmark.url), siteIcon: metadata.siteIcon || defaultSiteIcon(bookmark.url), thumbnail: metadata.thumbnail || "", previewUrl: metadata.previewUrl || "", categories: metadata.categories || [], performers: metadata.performers || [], studio: metadata.studio || "", duration: metadata.duration || "", quality: metadata.quality || "", publishedAt: metadata.publishedAt || "", metadataError: metadata.error || "", availability: metadata.removed ? "removed" : metadata.available ? "active" : "unknown", lastCheckedAt: metadata.checkedAt || "", tags: [], status: "later", favorite: false, createdAt: new Date().toISOString() }); added++; completed++; button.textContent = `Henter metadata ${completed}/${queue.length}`;
    });
    await persist(); document.querySelector("#importDialog").close(); render(); alert(`${added} nye links blev importeret. ${failed ? `${failed} sider svarede ikke eller blokerede metadata.` : "Metadata blev hentet, når hjemmesiden tillod det."} Dubletter blev sprunget over.`);
  } finally { button.disabled = false; button.textContent = "Importér valgte"; }
}

async function runPool(values, concurrency, worker) {
  let next = 0;
  const runners = Array.from({ length: Math.min(concurrency, values.length) }, async () => {
    while (next < values.length) { const index = next++; await worker(values[index], index); }
  });
  await Promise.all(runners);
}

async function refreshMetadata() {
  const targets = [...items];
  if (!targets.length) { alert("Biblioteket er tomt."); return; }
  const button = document.querySelector("#refreshMetadata"); button.disabled = true;
  let covers = 0; let logos = 0; let previews = 0; let improvedQuality = 0; let removed = 0; let completed = 0; let failed = 0;
  try {
    await runPool(targets, 3, async (item) => {
      const metadata = await chrome.runtime.sendMessage({ type: "FETCH_METADATA", url: item.url }) || {};
      if (metadata.ok === false && !metadata.removed) failed++;
      item.lastCheckedAt = metadata.checkedAt || new Date().toISOString();
      if (metadata.removed) { if (item.availability !== "removed") removed++; item.availability = "removed"; item.metadataError = metadata.error || "Videoen er fjernet"; completed++; button.textContent = `Opdaterer ${completed}/${targets.length}`; return; }
      if (metadata.available) { item.availability = "active"; item.metadataError = ""; }
      if (!item.siteIcon && (metadata.siteIcon || defaultSiteIcon(item.url))) { item.siteIcon = metadata.siteIcon || defaultSiteIcon(item.url); logos++; }
      if (!item.thumbnail && metadata.thumbnail) { item.thumbnail = metadata.thumbnail; covers++; }
      if (!item.previewUrl && metadata.previewUrl) { item.previewUrl = metadata.previewUrl; previews++; }
      if ((!item.title || item.title === "Uden titel") && metadata.title) item.title = metadata.title;
      if (metadata.categories?.length) item.categories = [...new Set([...(item.categories || []), ...metadata.categories])];
      if (metadata.performers?.length) item.performers = [...new Set([...(item.performers || []), ...metadata.performers])];
      if (metadata.studio) item.studio = metadata.studio;
      if (metadata.duration) item.duration = metadata.duration;
      if (metadata.quality && qualityScore(metadata.quality) > qualityScore(item.quality)) { item.quality = metadata.quality; improvedQuality++; }
      if (!item.publishedAt && metadata.publishedAt) item.publishedAt = metadata.publishedAt;
      completed++; button.textContent = `Opdaterer ${completed}/${targets.length}`;
    });
    await persist(); render();
    const missingDuration = items.filter((item) => item.availability !== "removed" && !item.duration).length;
    const missingQuality = items.filter((item) => item.availability !== "removed" && !item.quality).length;
    alert(`${covers} covers, ${logos} logoer, ${previews} previews og ${improvedQuality} kvalitetsangivelser blev forbedret.${removed ? ` ${removed} slettede videoer blev markeret.` : ""}${missingDuration || missingQuality ? ` Mangler efter kontrol: ${missingDuration} længder og ${missingQuality} kvaliteter, som kildesiderne ikke oplyste.` : ""}${failed ? ` ${failed} sider svarede ikke eller blokerede metadata.` : ""}`);
  } finally { button.disabled = false; button.textContent = "Opdatér metadata"; }
}

function openEdit(item) {
  document.querySelector("#editId").value = item.id;
  document.querySelector("#editTitle").value = item.title;
  document.querySelector("#editUrl").value = item.url;
  document.querySelector("#editTags").value = (item.tags || []).join(", ");
  document.querySelector("#editCategories").value = (item.categories || []).join(", ");
  document.querySelector("#editPerformers").value = (item.performers || []).join(", ");
  document.querySelector("#editStudio").value = item.studio || "";
  document.querySelector("#editDuration").value = item.duration || "";
  document.querySelector("#editQuality").value = item.quality || "";
  document.querySelector("#editStatus").value = item.status;
  document.querySelector("#editDialog").showModal();
}
async function saveEdit(event) {
  event.preventDefault();
  const id = document.querySelector("#editId").value;
  const url = document.querySelector("#editUrl").value.trim();
  if (!isHttpUrl(url)) { alert("Indtast et gyldigt http- eller https-link."); return; }
  if (items.some((item) => item.id !== id && normalize(item.url) === normalize(url))) { alert("Linket findes allerede på et andet kort."); return; }
  const existing = items.find((item) => item.id === id);
  const siteChanged = safeHost(existing?.url || "") !== safeHost(url);
  const urlChanged = normalize(existing?.url || "") !== normalize(url);
  await update(id, {
    title: document.querySelector("#editTitle").value.trim() || "Uden titel",
    url,
    site: safeHost(url),
    siteIcon: siteChanged ? defaultSiteIcon(url) : existing?.siteIcon || defaultSiteIcon(url),
    availability: urlChanged ? "unknown" : existing?.availability || "unknown",
    lastCheckedAt: urlChanged ? "" : existing?.lastCheckedAt || "",
    tags: commaList(document.querySelector("#editTags").value),
    categories: commaList(document.querySelector("#editCategories").value),
    performers: commaList(document.querySelector("#editPerformers").value),
    studio: document.querySelector("#editStudio").value.trim(),
    duration: document.querySelector("#editDuration").value.trim(),
    quality: document.querySelector("#editQuality").value.trim(),
    status: document.querySelector("#editStatus").value
  });
  document.querySelector("#editDialog").close();
}
function commaList(value) { return [...new Set(value.split(",").map((entry) => entry.trim()).filter(Boolean))]; }

function exportBackup() { const blob = new Blob([JSON.stringify({ version: 7, exportedAt: new Date().toISOString(), items }, null, 2)], { type: "application/json" }); const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = `privateflix-backup-${new Date().toISOString().slice(0, 10)}.json`; a.click(); URL.revokeObjectURL(url); }
async function restoreBackup(event) { const file = event.target.files[0]; if (!file) return; try { const data = JSON.parse(await file.text()); const restored = validateBackup(data); if (!confirm(`Indlæs ${restored.length} elementer? Din nuværende samling erstattes.`)) return; items = restored; await persist(); render(); } catch { alert("Filen er ikke en gyldig PrivateFlix-backup. Din nuværende samling er ikke ændret."); } finally { event.target.value = ""; } }
function validateBackup(data) {
  if (!data || typeof data !== "object" || !Array.isArray(data.items)) throw new Error("items mangler");
  return data.items.map((item, index) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) throw new Error(`Ugyldigt element ${index + 1}`);
    const primary = validateVersion(item, index);
    for (const key of ["categories", "performers", "tags"]) if (item[key] != null && (!Array.isArray(item[key]) || item[key].some((value) => typeof value !== "string"))) throw new Error(`Ugyldigt felt ${key}`);
    const alternatives = Array.isArray(item.alternatives) ? item.alternatives.map((version, alternativeIndex) => validateVersion(version, `${index + 1}.${alternativeIndex + 1}`)) : [];
    return { ...primary, tags:item.tags || [], status:item.status === "watched" ? "watched" : "later", favorite:Boolean(item.favorite), createdAt:Number.isFinite(Date.parse(item.createdAt)) ? item.createdAt : new Date().toISOString(), lastOpenedAt:Number.isFinite(Date.parse(item.lastOpenedAt)) ? item.lastOpenedAt : "", alternatives:dedupeVersions(alternatives).filter((version) => normalize(version.url) !== normalize(primary.url)) };
  });
}
function validateVersion(item, index) {
  if (!item || typeof item !== "object" || Array.isArray(item) || !isHttpUrl(item.url) || typeof item.title !== "string") throw new Error(`Ugyldig titel eller URL ${index}`);
  if (item.studio != null && typeof item.studio !== "string") throw new Error(`Ugyldigt produktionsselskab ${index}`);
  for (const key of ["categories", "performers"]) if (item[key] != null && (!Array.isArray(item[key]) || item[key].some((value) => typeof value !== "string"))) throw new Error(`Ugyldigt felt ${key}`);
  if (item.thumbnail && !isSafeMediaUrl(item.thumbnail, true)) throw new Error("Ugyldigt cover");
  if (item.siteIcon && !isSafeMediaUrl(item.siteIcon, true)) throw new Error("Ugyldigt logo");
  const previewValues = Array.isArray(item.previewUrl) ? item.previewUrl : item.previewUrl ? [item.previewUrl] : [];
  if (previewValues.some((url) => typeof url !== "string")) throw new Error("Ugyldigt preview");
  const previews = previewValues.filter(isPlayablePreviewUrl);
  return { ...versionSnapshot(item), id:typeof item.id === "string" && item.id ? item.id : crypto.randomUUID(), thumbnail:item.thumbnail || "", previewUrl:Array.isArray(item.previewUrl) ? previews : previews[0] || "" };
}
function isHttpUrl(value) { try { return /^https?:$/i.test(new URL(value).protocol); } catch { return false; } }
function isSafeMediaUrl(value, allowDataImage = false) { return isHttpUrl(value) || (allowDataImage && /^data:image\/(?:png|jpe?g|webp|gif);base64,/i.test(value)); }
function resetFilters() { ["search", "siteFilter", "categoryFilter", "performerFilter", "studioFilter", "statusFilter"].forEach((id) => { document.querySelector(`#${id}`).value = ""; }); render(); }
function safeHost(url) { try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return "Ukendt"; } }
function defaultSiteIcon(url) { try { return new URL("/favicon.ico", url).href; } catch { return ""; } }
function normalize(url) { try { const u = new URL(url); u.hash = ""; ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"].forEach((key) => u.searchParams.delete(key)); return u.toString().replace(/\/$/, ""); } catch { return url; } }
