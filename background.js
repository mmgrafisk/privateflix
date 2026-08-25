const LIBRARY_KEY = "privateflix_items";

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({ id: "privateflix-save", title: "Gem i PrivateFlix", contexts: ["page", "link"] });
  });
});

chrome.action.onClicked?.addListener(() => {});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== "privateflix-save") return;
  const url = info.linkUrl || info.pageUrl || tab?.url || "";
  if (!/^https?:\/\//i.test(url)) return;
  const metadata = await fetchMetadata(url);
  await saveItem({
    title: metadata.title || (url === tab?.url ? tab?.title : "") || "Uden titel",
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
    availability: metadata.removed ? "removed" : metadata.available ? "active" : "unknown",
    lastCheckedAt: metadata.checkedAt || ""
  });
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "SAVE_ITEM") {
    saveItem(message.item).then(sendResponse);
    return true;
  }
  if (message.type === "GET_ITEMS") {
    getItems().then(sendResponse);
    return true;
  }
  if (message.type === "FETCH_METADATA") {
    fetchMetadata(message.url).then(sendResponse);
    return true;
  }
});

async function getItems() {
  const result = await chrome.storage.local.get(LIBRARY_KEY);
  return result[LIBRARY_KEY] || [];
}

async function saveItem(item) {
  const items = await getItems();
  const normalized = normalizeUrl(item.url);
  if (items.some((entry) => normalizeUrl(entry.url) === normalized)) {
    return { ok: false, duplicate: true };
  }
  let fetched = {};
  if (!item.categories?.length || !item.performers?.length || !item.studio || !item.duration || !item.quality) fetched = await fetchMetadata(item.url);
  const entry = {
    id: crypto.randomUUID(),
    title: item.title || "Uden titel",
    url: item.url,
    site: item.site || safeHost(item.url),
    siteIcon: item.siteIcon || fetched.siteIcon || defaultSiteIcon(item.url),
    thumbnail: item.thumbnail || fetched.thumbnail || "",
    previewUrl: sanitizePreview(item.previewUrl) || fetched.previewUrl || "",
    categories: unique([...(item.categories || []), ...(fetched.categories || [])]),
    performers: unique([...(item.performers || []), ...(fetched.performers || [])]),
    studio: item.studio || fetched.studio || "",
    duration: item.duration || fetched.duration || "",
    quality: betterQuality(item.quality, fetched.quality),
    publishedAt: item.publishedAt || fetched.publishedAt || "",
    availability: item.availability || (fetched.removed ? "removed" : fetched.available ? "active" : "unknown"),
    lastCheckedAt: item.lastCheckedAt || fetched.checkedAt || "",
    tags: item.tags || [],
    status: item.status || "later",
    favorite: Boolean(item.favorite),
    createdAt: new Date().toISOString()
  };
  items.unshift(entry);
  await chrome.storage.local.set({ [LIBRARY_KEY]: items });
  return { ok: true, item: entry };
}

async function fetchMetadata(url, timeoutMs = 10_000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const checkedAt = new Date().toISOString();
  try {
    const response = await fetch(url, { redirect: "follow", credentials: "omit", signal: controller.signal });
    if (!response.ok) return { ok:false, available:false, removed:[404, 410].includes(response.status), httpStatus:response.status, checkedAt, error:`HTTP ${response.status}`, title:"", siteIcon:defaultSiteIcon(url), thumbnail:"", previewUrl:"" };
    if (!(response.headers.get("content-type") || "").includes("text/html")) return { ok:false, available:true, removed:false, checkedAt, error:"Linket virker, men siden er ikke HTML", title:"", siteIcon:defaultSiteIcon(response.url || url), thumbnail:"", previewUrl:"" };
    const html = (await response.text()).slice(0, 2_000_000);
    if (looksLikeRemovedPage(html)) return { ok:false, available:false, removed:true, softRemoved:true, httpStatus:200, checkedAt, error:"Siden viser, at videoen er fjernet", title:extractTitle(html), siteIcon:extractSiteIcon(html, response.url), thumbnail:"", previewUrl:"" };
    const meta = extractMeta(html); const structured = extractStructuredData(html);
    const declaredPreview = uniqueUrls([
      meta(["og:video:url", "og:video:secure_url", "og:video", "twitter:player:stream"]),
      structured.previewUrl
    ]).map((value) => absolute(value, response.url)).filter((value) => isPlausibleVideoUrl(value));
    const attributePreview = extractPreviewUrls(html)
      .map((value) => absolute(value, response.url))
      .filter((value) => isPlausibleVideoUrl(value, true));
    const previewCandidates = [...new Set([...declaredPreview, ...attributePreview])].slice(0, 6);
    return { ok:true, available:true, removed:false, checkedAt, title:meta(["og:title", "twitter:title"]) || structured.title || extractTitle(html), siteIcon:extractSiteIcon(html, response.url), thumbnail:absolute(meta(["og:image", "og:image:url", "twitter:image", "twitter:image:src"]) || structured.thumbnail, response.url), previewUrl:previewCandidates.length > 1 ? previewCandidates : previewCandidates[0] || "", categories:unique([...meta.all(["video:tag", "article:tag", "keywords"]), ...structured.categories]), performers:unique([...meta.all(["video:actor", "video:performer", "actor", "performer"]), ...structured.performers]), studio:structured.studio || meta(["video:studio", "studio", "production_company", "producer"]) || extractStudio(html), duration:structured.duration || extractDuration(html, meta), quality:structured.quality || extractQuality(html, meta), publishedAt:structured.publishedAt };
  } catch (error) {
    const message = error?.name === "AbortError" ? "Timeout efter 10 sekunder" : error.message;
    return { ok:false, available:null, removed:false, checkedAt, error:message, title:"", siteIcon:defaultSiteIcon(url), thumbnail:"", previewUrl:"" };
  } finally {
    clearTimeout(timeout);
  }
}
function extractMeta(html) {
  const values = new Map();
  for (const match of html.matchAll(/<meta\s+[^>]*>/gi)) { const tag = match[0]; const key = (attr(tag, "property") || attr(tag, "name") || attr(tag, "itemprop")).toLowerCase(); const value = attr(tag, "content"); if (key && value) { const decoded = decode(value); if (["video:tag", "article:tag", "keywords", "video:actor", "video:performer", "actor", "performer"].includes(key) && values.has(key)) values.set(key, `${values.get(key)},${decoded}`); else if (!values.has(key)) values.set(key, decoded); } }
  const getter = (keys) => keys.map((key) => values.get(key)).find(Boolean) || "";
  getter.all = (keys) => unique(keys.flatMap((key) => (values.get(key) || "").split(",")).map((x) => x.trim()).filter(Boolean)); return getter;
}
function extractStructuredData(html) {
  const output = { title:"", thumbnail:"", previewUrl:"", categories:[], performers:[], studio:"", duration:"", quality:"", publishedAt:"" };
  for (const match of html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) { try { const parsed = JSON.parse(match[1]); const nodes = Array.isArray(parsed) ? parsed : parsed["@graph"] || [parsed]; for (const node of nodes) { if (!node || typeof node !== "object") continue; output.title ||= node.name || node.headline || ""; output.thumbnail ||= Array.isArray(node.thumbnailUrl) ? node.thumbnailUrl[0] : node.thumbnailUrl || node.image?.url || node.image || ""; output.previewUrl ||= node.contentUrl || ""; output.duration ||= node.duration || ""; const encodingQuality = toList(node.encoding).map((encoding) => encoding?.height ? `${encoding.height}p` : encoding?.videoQuality || "").reduce((best, current) => betterQuality(best, current), ""); output.quality = betterQuality(output.quality, node.videoQuality || (node.height ? `${node.height}p` : ""), encodingQuality); output.studio ||= entityName(node.productionCompany) || entityName(node.publisher) || entityName(node.brand) || entityName(node.provider) || ""; output.publishedAt ||= node.uploadDate || node.datePublished || ""; output.categories.push(...toList(node.genre), ...toList(node.keywords), ...toList(node.tags)); output.performers.push(...[...toList(node.actor), ...toList(node.actors), ...toList(node.performer), ...toList(node.performers)].map((x) => typeof x === "string" ? x : x?.name).filter(Boolean)); } } catch {} }
  output.categories = unique(output.categories); output.performers = unique(output.performers); return output;
}
function toList(value) { return value == null ? [] : Array.isArray(value) ? value : typeof value === "string" ? value.split(",").map((x) => x.trim()) : [value]; }
function entityName(value) { if (Array.isArray(value)) return value.map(entityName).find(Boolean) || ""; return typeof value === "string" ? value.trim() : value?.name?.trim?.() || ""; }
function unique(values) { return [...new Set(values.filter((x) => typeof x === "string" && x.trim()).map((x) => x.trim()))].slice(0, 30); }
function attr(tag, name) { const match = tag.match(new RegExp(`\\s${name}\\s*=\\s*(?:["']([^"']*)["']|([^\\s>]+))`, "i")); return match?.[1] || match?.[2] || ""; }
function extractTitle(html) { const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i); return match ? decode(match[1].replace(/\s+/g, " ").trim()) : ""; }
function looksLikeRemovedPage(html) {
  const title = extractTitle(html); const heading = decode(html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1]?.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() || "");
  const signal = `${title} ${heading}`.toLowerCase();
  return /(?:^|\b)(?:404|410|page not found|video (?:has been |was )?(?:removed|deleted)|video unavailable|siden blev ikke fundet|siden findes ikke|videoen (?:er |blev )?(?:fjernet|slettet)|videoen findes ikke længere)(?:\b|$)/i.test(signal);
}
function extractSiteIcon(html, base) {
  const candidates = [];
  for (const match of html.matchAll(/<link\s+[^>]*>/gi)) {
    const tag = match[0]; const rel = attr(tag, "rel").toLowerCase(); const href = attr(tag, "href");
    if (href && /(?:^|\s)(?:shortcut\s+icon|icon|apple-touch-icon)(?:\s|$)/i.test(rel)) candidates.push(absolute(href, base));
  }
  return candidates.find((value) => /^https?:\/\//i.test(value)) || defaultSiteIcon(base);
}
function decode(value) { return value.replace(/&amp;/gi, "&").replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">"); }
function absolute(value, base) { if (!value) return ""; try { return new URL(value, base).href; } catch { return ""; } }
function uniqueUrls(values) { return [...new Set(values.flat().filter((x) => typeof x === "string").map((x) => x.trim().replace(/\\u0026/g, "&").replace(/\\\//g, "/")).filter((x) => /^(?:https?:|\/)/i.test(x)))].slice(0, 6); }
function extractPreviewUrls(html) { const urls = []; const attributes = /(?:data-(?:preview|video-preview|preview-video|trailer|webm|mp4)|data-mediabook|video_url|preview_url)\s*=\s*["']([^"']+)["']/gi; for (const match of html.matchAll(attributes)) urls.push(decode(match[1])); for (const match of html.matchAll(/https?:\\?\/\\?\/[^"'\s<>]+?\.(?:mp4|webm|m3u8)(?:\?[^"'\s<>]*)?/gi)) urls.push(match[0]); return urls; }
function isPlausibleVideoUrl(value, requireVideoExtension = false) {
  if (!value || !/^https?:\/\//i.test(value)) return false;
  let parsed;
  try { parsed = new URL(value); } catch { return false; }
  const path = parsed.pathname.toLowerCase();
  if (/\.(?:jpe?g|png|gif|webp|avif|svg|html?|php)(?:$|\/)/i.test(path)) return false;
  if (/(?:^|\/)embed(?:\/|$)|(?:^|\/)player(?:\/|$)/i.test(path)) return false;
  return !requireVideoExtension || /\.(?:mp4|webm|m3u8|mov)(?:$|\/)/i.test(path);
}
function sanitizePreview(value) {
  const valid = (Array.isArray(value) ? value : [value]).filter((url) => isPlausibleVideoUrl(url));
  return valid.length > 1 ? valid : valid[0] || "";
}
function extractDuration(html, meta) { const value = meta(["video:duration", "duration"]); if (value) return value; const match = html.match(/(?:duration|videoDuration)["'\s:=]+(?:PT)?(\d{1,2}:\d{2}(?::\d{2})?|\d{2,5})/i); return match?.[1] || ""; }
function extractStudio(html) { const match = html.match(/(?:data-(?:studio|production-company)|productionCompany|studioName|producerName)\s*[=:]\s*["']([^"']{2,100})["']/i); return match ? decode(match[1]).trim() : ""; }
function extractQuality(html, meta) { const candidates = [meta(["video:quality", "quality"])]; for (const match of html.matchAll(/(?:data-(?:quality|resolution|height)|videoQuality|quality|resolution)\s*[=:]\s*["']?\s*(4320p|2160p|1440p|1080p|720p|480p|4K|8K|UHD)\b/gi)) candidates.push(match[1]); return candidates.reduce((best, current) => betterQuality(best, current), ""); }
function qualityRank(value) { const text = String(value || ""); return /8k|4320/i.test(text) ? 4320 : /4k|2160|uhd/i.test(text) ? 2160 : /2k|1440|qhd/i.test(text) ? 1440 : Number(text.match(/\d{3,4}/)?.[0] || 0); }
function betterQuality(...values) { return values.flat().filter(Boolean).sort((a, b) => qualityRank(b) - qualityRank(a))[0] || ""; }

function normalizeUrl(url) {
  try {
    const parsed = new URL(url);
    parsed.hash = "";
    ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"].forEach((key) => parsed.searchParams.delete(key));
    return parsed.toString().replace(/\/$/, "");
  } catch {
    return url;
  }
}

function safeHost(url) {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return "Ukendt"; }
}
function defaultSiteIcon(url) {
  try { return new URL("/favicon.ico", url).href; } catch { return ""; }
}
