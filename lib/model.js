export const LIBRARY_KEY = "privateflix_library_v1";
export const SETTINGS_KEY = "privateflix_settings_v1";
export const CATALOG_CACHE_KEY = "privateflix_catalog_cache_v2";
export const ITEM_TYPES = ["chat", "image", "video", "voice", "link"];

export function createId() {
  return globalThis.crypto?.randomUUID?.() || `pf-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function normalizeUrl(value) {
  try {
    const url = new URL(String(value || "").trim());
    if (!/^https?:$/.test(url.protocol)) return "";
    url.hash = "";
    return url.toString();
  } catch {
    return "";
  }
}

export function domainFromUrl(value) {
  try {
    return new URL(value).hostname.replace(/^www\./, "");
  } catch {
    return "Saved item";
  }
}

export function inferType(value = "") {
  const text = String(value).toLowerCase();
  if (/video|tube|stream|motion/.test(text)) return "video";
  if (/image|photo|gallery|art|stable|midjourney/.test(text)) return "image";
  if (/voice|audio|sound/.test(text)) return "voice";
  if (/chat|character|companion|roleplay|bot/.test(text)) return "chat";
  return "link";
}

export function normalizeTags(value) {
  const source = Array.isArray(value) ? value : String(value || "").split(",");
  return [...new Set(source.map((tag) => String(tag).trim().toLowerCase()).filter(Boolean))].slice(0, 12);
}

export function normalizePeople(value) {
  const source=Array.isArray(value)?value:String(value||"").split(",");
  return [...new Set(source.map((name)=>String(name||"").replace(/\s+/g," ").trim()).filter((name)=>name.length>=2&&name.length<=80))].slice(0,12);
}

export function qualityFromHeight(height) {
  const pixels = Number(height || 0);
  if (pixels >= 2160) return "4K";
  if (pixels >= 1440) return "1440p";
  if (pixels >= 1080) return "1080p";
  if (pixels >= 720) return "720p";
  return pixels > 0 ? `${Math.round(pixels)}p` : "";
}

export function formatDuration(value) {
  const total = Math.round(Number(value || 0));
  if (!Number.isFinite(total) || total <= 0) return "";
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  return hours ? `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}` : `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export function normalizeItem(input, now = new Date().toISOString()) {
  const url = normalizeUrl(input?.url);
  if (!url) throw new Error("Enter a valid http or https URL.");
  const type = ITEM_TYPES.includes(input?.type) ? input.type : inferType(`${input?.title || ""} ${url}`);
  const durationSeconds = Math.round(Number(input?.durationSeconds || 0));
  const width = Math.round(Number(input?.width || 0));
  const height = Math.round(Number(input?.height || 0));
  return {
    id: String(input?.id || createId()),
    url,
    title: String(input?.title || domainFromUrl(url)).trim().slice(0, 180) || domainFromUrl(url),
    source: domainFromUrl(url),
    type,
    note: String(input?.note || "").trim().slice(0, 1000),
    tags: normalizeTags(input?.tags),
    favorite: Boolean(input?.favorite),
    thumbnailUrl: normalizeUrl(input?.thumbnailUrl),
    previewUrl: normalizeUrl(input?.previewUrl),
    siteIconUrl: normalizeUrl(input?.siteIconUrl),
    actors: normalizePeople(input?.actors),
    durationSeconds: Number.isFinite(durationSeconds) && durationSeconds > 0 && durationSeconds <= 172800 ? durationSeconds : 0,
    quality: String(input?.quality || qualityFromHeight(height)).trim().slice(0, 32),
    width: Number.isFinite(width) && width > 0 ? width : 0,
    height: Number.isFinite(height) && height > 0 ? height : 0,
    createdAt: String(input?.createdAt || now),
    updatedAt: now
  };
}

export function upsertItem(items, input, now = new Date().toISOString()) {
  const normalized = normalizeItem(input, now);
  const matchIndex = items.findIndex((item) => item.id === normalized.id || normalizeUrl(item.url) === normalized.url);
  if (matchIndex === -1) return [normalized, ...items];
  const existing = items[matchIndex];
  const updated = {
    ...existing,
    ...normalized,
    id: existing.id,
    createdAt: existing.createdAt,
    favorite: input.favorite === undefined ? Boolean(existing.favorite) : Boolean(input.favorite),
    thumbnailUrl: input.thumbnailUrl === undefined ? existing.thumbnailUrl : normalized.thumbnailUrl,
    previewUrl: input.previewUrl === undefined ? existing.previewUrl : normalized.previewUrl,
    siteIconUrl: input.siteIconUrl === undefined ? existing.siteIconUrl : normalized.siteIconUrl,
    actors: input.actors === undefined ? existing.actors : normalized.actors,
    durationSeconds: input.durationSeconds === undefined ? existing.durationSeconds : normalized.durationSeconds,
    quality: input.quality === undefined ? existing.quality : normalized.quality,
    width: input.width === undefined ? existing.width : normalized.width,
    height: input.height === undefined ? existing.height : normalized.height
  };
  return [updated, ...items.filter((_, index) => index !== matchIndex)];
}

export function filterItems(items, { query = "", type = "all", site = "", performer = "", favorites = false, sort = "newest" } = {}) {
  const needle = query.trim().toLowerCase();
  const filtered = items.filter((item) => {
    if (favorites && !item.favorite) return false;
    if (type !== "all" && item.type !== type) return false;
    if (site && item.source !== site) return false;
    if (performer && !(item.actors || []).includes(performer)) return false;
    if (!needle) return true;
    return [item.title, item.source, item.note, ...(item.actors || []), ...(item.tags || [])].join(" ").toLowerCase().includes(needle);
  });
  return filtered.sort((a, b) => {
    if (sort === "title") return a.title.localeCompare(b.title);
    if (sort === "site") return a.source.localeCompare(b.source) || a.title.localeCompare(b.title);
    if (sort === "performer") {
      const firstActor=(item)=>[...(item.actors||[])].sort((left,right)=>left.localeCompare(right))[0]||"\uffff";
      return firstActor(a).localeCompare(firstActor(b)) || a.title.localeCompare(b.title);
    }
    if (sort === "oldest") return a.createdAt.localeCompare(b.createdAt);
    return b.createdAt.localeCompare(a.createdAt);
  });
}

export function safeImport(payload) {
  const source = Array.isArray(payload) ? payload : payload?.items;
  if (!Array.isArray(source)) throw new Error("This file does not contain a PrivateFlix library.");
  if (source.length > 5000) throw new Error("This library is too large to import at once.");
  const imported = [];
  for (const item of source) {
    try {
      imported.push(normalizeItem(item, String(item?.updatedAt || new Date().toISOString())));
    } catch {
      // Invalid entries are skipped instead of breaking the whole import.
    }
  }
  return imported;
}
