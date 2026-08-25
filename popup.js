let currentTab;
let metadata = {};

document.addEventListener("DOMContentLoaded", init);

async function init() {
  [currentTab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!currentTab?.url?.startsWith("http")) {
    showMessage("Denne side kan ikke gemmes.", true);
    document.querySelector("#save").disabled = true;
    return;
  }
  document.querySelector("#title").value = currentTab.title || "";
  try {
    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId: currentTab.id },
      func: () => {
        const meta = (selector) => document.querySelector(selector)?.content || "";
        const metas = (selector) => [...document.querySelectorAll(selector)].flatMap((node) => String(node.content || "").split(",")).map((value) => value.trim()).filter(Boolean);
        const video = document.querySelector("video");
        const previewElement = document.querySelector("[data-preview], [data-video-preview], [data-preview-video], [data-mediabook], [data-webm], [data-mp4]");
        const previewAttributes = ["data-preview", "data-video-preview", "data-preview-video", "data-mediabook", "data-webm", "data-mp4"];
        const preview = previewAttributes.map((name) => previewElement?.getAttribute(name)).find(Boolean);
        const isPreview = (value) => {
          if (!value || !/^https?:\/\//i.test(value)) return false;
          try {
            const path = new URL(value).pathname.toLowerCase();
            return !/\.(?:jpe?g|png|gif|webp|avif|svg|html?|php)(?:$|\/)/i.test(path) && !/(?:^|\/)embed(?:\/|$)|(?:^|\/)player(?:\/|$)/i.test(path);
          } catch { return false; }
        };
        const previewCandidates = [meta('meta[property="og:video:url"]'), meta('meta[property="og:video:secure_url"]'), meta('meta[property="og:video"]'), meta('meta[name="twitter:player:stream"]'), video?.currentSrc, video?.querySelector("source")?.src, preview].filter(isPreview);
        const qualityText = meta('meta[property="video:quality"]') || document.querySelector("[data-quality],[data-resolution],[data-height]")?.getAttribute("data-quality") || document.querySelector("[data-resolution]")?.getAttribute("data-resolution") || "";
        const structured = { categories:[], performers:[], studio:"", duration:"", quality:"" };
        const toList = (value) => value == null ? [] : Array.isArray(value) ? value : typeof value === "string" ? value.split(",") : [value];
        const name = (value) => typeof value === "string" ? value : value?.name || "";
        document.querySelectorAll('script[type="application/ld+json"]').forEach((script) => { try {
          const parsed = JSON.parse(script.textContent); const nodes = Array.isArray(parsed) ? parsed : parsed?.["@graph"] || [parsed];
          nodes.forEach((node) => { if (!node || typeof node !== "object") return;
            structured.categories.push(...toList(node.genre), ...toList(node.keywords), ...toList(node.tags));
            structured.performers.push(...[...toList(node.actor), ...toList(node.actors), ...toList(node.performer), ...toList(node.performers)].map(name));
            structured.studio ||= name(node.productionCompany) || name(node.publisher) || name(node.brand) || name(node.provider);
            structured.duration ||= node.duration || ""; structured.quality ||= node.videoQuality || (node.height ? `${node.height}p` : "");
          });
        } catch {} });
        const unique = (values) => [...new Set(values.map((value) => String(value).trim()).filter(Boolean))];
        return {
          title: meta('meta[property="og:title"]') || document.title,
          siteIcon: document.querySelector('link[rel~="icon"], link[rel="shortcut icon"], link[rel="apple-touch-icon"]')?.href || `${location.origin}/favicon.ico`,
          image: meta('meta[property="og:image"]') || meta('meta[name="twitter:image"]') || video?.poster || "",
          previewUrl: previewCandidates[0] || "",
          categories: unique([...metas('meta[property="video:tag"],meta[property="article:tag"],meta[name="keywords"]'), ...structured.categories]),
          performers: unique([...metas('meta[property="video:actor"],meta[property="video:performer"],meta[name="actor"],meta[name="performer"]'), ...structured.performers]),
          studio: structured.studio || meta('meta[property="video:studio"]') || meta('meta[name="studio"]') || meta('meta[name="production_company"]') || "",
          duration: Number.isFinite(video?.duration) ? video.duration : structured.duration || meta('meta[property="video:duration"]'),
          quality: video?.videoHeight ? `${video.videoHeight}p` : structured.quality || qualityText.match(/\b(?:8K|4K|2160p|1440p|1080p|720p)\b/i)?.[0] || ""
        };
      }
    });
    metadata = result || {};
    document.querySelector("#title").value = metadata.title || currentTab.title || "";
  } catch {}
  renderPreview();
}

function renderPreview() {
  const preview = document.querySelector("#preview");
  if (metadata.image) {
    const image = document.createElement("img");
    image.src = metadata.image;
    image.alt = "Forhåndsvisning";
    image.referrerPolicy = "no-referrer";
    image.onerror = () => { preview.textContent = host(currentTab.url); };
    preview.replaceChildren(image);
  } else {
    preview.textContent = host(currentTab.url);
  }
}

document.querySelector("#save").addEventListener("click", async () => {
  const button = document.querySelector("#save");
  button.disabled = true;
  const item = {
    title: document.querySelector("#title").value.trim() || currentTab.title,
    url: currentTab.url,
    site: host(currentTab.url),
    siteIcon: metadata.siteIcon || defaultSiteIcon(currentTab.url),
    thumbnail: metadata.image || "",
    previewUrl: metadata.previewUrl || "",
    categories: metadata.categories || [],
    performers: metadata.performers || [],
    studio: metadata.studio || "",
    duration: metadata.duration || "",
    quality: metadata.quality || "",
    availability: "active",
    lastCheckedAt: new Date().toISOString(),
    tags: document.querySelector("#tags").value.split(",").map((tag) => tag.trim()).filter(Boolean)
  };
  try {
    const response = await chrome.runtime.sendMessage({ type: "SAVE_ITEM", item });
    if (!response) throw new Error("Intet svar");
    if (response.duplicate) showMessage("Linket findes allerede i biblioteket.", true);
    else if (!response.ok) showMessage("Linket kunne ikke gemmes. Prøv igen.", true);
    else showMessage("Gemt privat på denne computer.");
  } catch { showMessage("Linket kunne ikke gemmes. Prøv igen.", true); }
  finally { button.disabled = false; }
});

document.querySelector("#openLibrary").addEventListener("click", () => chrome.tabs.create({ url: chrome.runtime.getURL("library.html") }));
document.querySelector("#openAffiliates").addEventListener("click", () => chrome.tabs.create({ url: chrome.runtime.getURL("affiliates.html") }));

function host(url) { try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return "Ukendt"; } }
function defaultSiteIcon(url) { try { return new URL("/favicon.ico", url).href; } catch { return ""; } }
function showMessage(text, error = false) { const el = document.querySelector("#message"); el.textContent = text; el.classList.toggle("error", error); }
