import { domainFromUrl, formatDuration, inferType } from "./lib/model.js";
import { getLibrary, saveItem } from "./lib/storage.js";
import { extractTabMetadata } from "./lib/page-metadata.js";
import { applyShieldView, getShieldState, toggleShield } from "./lib/shield.js";

const elements = {
  panel: document.querySelector("#save-panel"),
  unsupported: document.querySelector("#unsupported"),
  form: document.querySelector("#save-form"),
  title: document.querySelector("#page-title"),
  domain: document.querySelector("#page-domain"),
  initial: document.querySelector("#page-initial"),
  cover: document.querySelector("#page-cover"),
  facts: document.querySelector("#page-facts"),
  type: document.querySelector("#type"),
  tags: document.querySelector("#tags"),
  note: document.querySelector("#note"),
  saved: document.querySelector("#saved-state"),
  button: document.querySelector("#save-button"),
  status: document.querySelector("#status"),
  recent: document.querySelector("#recent-list")
};

let activeTab = null;
let existingItem = null;
let pageMetadata = {};
let initialized = false;
let coverObjectUrl = "";

function mediaFacts(metadata) {
  const duration = formatDuration(metadata?.durationSeconds);
  return [metadata?.quality || "Quality unknown", duration || "Duration unknown"].join(" · ");
}

async function applyPageMetadata(metadata) {
  elements.facts.textContent = mediaFacts(metadata);
  if (!metadata?.thumbnailUrl) return;
  try {
    const response=await fetch(metadata.thumbnailUrl,{cache:"no-store",credentials:"include",referrer:activeTab?.url,referrerPolicy:"strict-origin-when-cross-origin"});
    if(!response.ok)throw new Error("Poster unavailable");
    const blob=await response.blob();if(blob.size>12*1024*1024||blob.type&&!blob.type.startsWith("image/"))throw new Error("Invalid poster");
    if(coverObjectUrl)URL.revokeObjectURL(coverObjectUrl);coverObjectUrl=URL.createObjectURL(blob);
    elements.cover.style.backgroundImage = `linear-gradient(rgba(8,7,9,.18),rgba(8,7,9,.52)),url("${coverObjectUrl}")`;
    elements.cover.style.backgroundSize = "cover";
    elements.cover.style.backgroundPosition = "center";
    elements.initial.hidden = true;
  } catch { /* Website access can be granted when the user saves. */ }
}

function mediaPatterns(metadata){return[activeTab?.url,metadata?.thumbnailUrl,metadata?.previewUrl,metadata?.siteIconUrl].flat().map((value)=>{try{const url=new URL(value);return /^https?:$/.test(url.protocol)?`${url.protocol}//${url.host}/*`:""}catch{return""}}).filter((value,index,list)=>value&&list.indexOf(value)===index)}
async function ensureMediaAccess(metadata){const origins=mediaPatterns(metadata);if(!origins.length||await chrome.permissions.contains({origins}))return true;elements.status.textContent="Chrome needs access to the source websites to display posters and previews.";return chrome.permissions.request({origins})}

function setType(type) {
  elements.type.value = type;
  document.querySelectorAll(".type-option").forEach((button) => {
    const active = button.dataset.type === type;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  });
}

function renderRecent(items) {
  const recent = items.slice(0, 3);
  if (!recent.length) {
    elements.recent.innerHTML = '<p class="empty-recent">Your private library is ready for its first save.</p>';
    return;
  }
  elements.recent.replaceChildren(...recent.map((item) => {
    const link = document.createElement("a");
    link.className = "recent-item";
    link.href = item.url;
    link.target = "_blank";
    link.rel = "noreferrer";
    const cover = document.createElement("span");
    cover.className = "recent-cover";
    cover.textContent = { chat: "◇", image: "▧", video: "▶", voice: "◉", link: "↗" }[item.type] || "↗";
    const copy = document.createElement("span");
    copy.className = "recent-copy";
    const title = document.createElement("strong");
    title.textContent = item.title;
    const meta = document.createElement("span");
    meta.textContent = `${item.type} · ${item.source}`;
    copy.append(title, meta);
    const arrow = document.createElement("span");
    arrow.className = "recent-arrow";
    arrow.textContent = "↗";
    link.append(cover, copy, arrow);
    return link;
  }));
}

function openLibrary() {
  chrome.runtime.sendMessage({ type: "OPEN_LIBRARY" });
  window.close();
}

document.querySelectorAll(".type-option").forEach((button) => button.addEventListener("click", () => setType(button.dataset.type)));
document.querySelector("#open-library").addEventListener("click", openLibrary);
document.querySelector("#open-library-top").addEventListener("click", openLibrary);

elements.form.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!activeTab?.url) return;
  elements.button.disabled = true;
  elements.status.textContent = "Saving privately…";
  try {
    const mediaAccess=await ensureMediaAccess(pageMetadata);
    existingItem = await saveItem({
      ...existingItem,
      url: activeTab.url,
      title: activeTab.title || domainFromUrl(activeTab.url),
      type: elements.type.value,
      tags: elements.tags.value,
      note: elements.note.value,
      ...pageMetadata
    });
    if(mediaAccess)await applyPageMetadata(pageMetadata);
    elements.saved.hidden = false;
    elements.button.querySelector("span:first-child").textContent = "Saved to PrivateFlix";
    elements.status.textContent = mediaAccess ? "Only this browser can see your saved item." : "Saved. Grant website access from Settings to display source posters.";
    renderRecent(await getLibrary());
  } catch (error) {
    elements.status.textContent = error instanceof Error ? error.message : "Could not save this page.";
  } finally {
    elements.button.disabled = false;
  }
});

async function init() {
  const items = await getLibrary();
  renderRecent(items);
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  activeTab = tab;
  if (!tab?.url || !/^https?:/.test(tab.url)) {
    elements.panel.hidden = true;
    elements.unsupported.hidden = false;
    return;
  }
  elements.title.textContent = tab.title || domainFromUrl(tab.url);
  elements.domain.textContent = domainFromUrl(tab.url);
  elements.initial.textContent = domainFromUrl(tab.url).slice(0, 1).toUpperCase();
  pageMetadata = await extractTabMetadata(tab.id);
  await applyPageMetadata(pageMetadata);
  existingItem = items.find((item) => item.url === tab.url || item.url.replace(/\/$/, "") === tab.url.replace(/\/$/, ""));
  if (existingItem) {
    elements.saved.hidden = false;
    elements.tags.value = (existingItem.tags || []).join(", ");
    elements.note.value = existingItem.note || "";
    elements.button.querySelector("span:first-child").textContent = "Update saved item";
    pageMetadata = {
      thumbnailUrl: pageMetadata.thumbnailUrl || existingItem.thumbnailUrl,
      previewUrl: pageMetadata.previewUrl || existingItem.previewUrl,
      siteIconUrl: pageMetadata.siteIconUrl || existingItem.siteIconUrl,
      actors: pageMetadata.actors?.length ? pageMetadata.actors : existingItem.actors,
      durationSeconds: pageMetadata.durationSeconds || existingItem.durationSeconds,
      quality: pageMetadata.quality || existingItem.quality,
      width: pageMetadata.width || existingItem.width,
      height: pageMetadata.height || existingItem.height
    };
    await applyPageMetadata(pageMetadata);
    setType(existingItem.type);
  } else {
    setType(inferType(`${tab.title || ""} ${tab.url}`));
  }
}

async function showShield(active) {
  applyShieldView(active,{privateTitle:"PrivateFlix"});
  if (!active && !initialized) { initialized=true; await init(); }
}

document.querySelector("#shield-button").addEventListener("click",async()=>showShield(await toggleShield()));
document.querySelectorAll("[data-restore-privateflix]").forEach((button)=>button.addEventListener("click",async()=>showShield(await toggleShield())));
chrome.runtime.onMessage.addListener((message)=>{if(message?.type==="PRIVACY_SHIELD_CHANGED")showShield(Boolean(message.active));});
chrome.storage.onChanged.addListener((changes,area)=>{if(area==="session"&&changes.privateflix_privacy_shield)showShield(Boolean(changes.privateflix_privacy_shield.newValue));});

getShieldState().then(showShield).catch(()=>showShield(false)).catch(() => {
  elements.panel.hidden = true;
  elements.unsupported.hidden = false;
});
window.addEventListener("unload",()=>{if(coverObjectUrl)URL.revokeObjectURL(coverObjectUrl)});
