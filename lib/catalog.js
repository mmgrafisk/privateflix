import { CATALOG_CACHE_KEY } from "./model.js";

export const CATALOG_URL = "https://privateflix-hub.mmgrafisk.chatgpt.site/api/catalog";

function isValidCatalog(value) {
  return value?.version === 2 && Array.isArray(value?.programs) && Array.isArray(value?.ads);
}

export async function getCatalog() {
  try {
    const response = await fetch(CATALOG_URL, { cache: "no-store" });
    if (!response.ok) throw new Error("Catalogue request failed.");
    const catalog = await response.json();
    if (!isValidCatalog(catalog)) throw new Error("Unsupported catalogue format.");
    await chrome.storage.local.set({ [CATALOG_CACHE_KEY]: catalog });
    return { catalog, cached: false };
  } catch (error) {
    const stored = await chrome.storage.local.get(CATALOG_CACHE_KEY);
    if (isValidCatalog(stored[CATALOG_CACHE_KEY])) return { catalog: stored[CATALOG_CACHE_KEY], cached: true };
    throw error;
  }
}
