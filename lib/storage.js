import { LIBRARY_KEY, SETTINGS_KEY, normalizeItem, upsertItem } from "./model.js";

const storage = () => chrome.storage.local;

export async function getLibrary() {
  const result = await storage().get(LIBRARY_KEY);
  return Array.isArray(result[LIBRARY_KEY]) ? result[LIBRARY_KEY] : [];
}

export async function saveLibrary(items) {
  await storage().set({ [LIBRARY_KEY]: items });
  await updateBadge(items.length);
  return items;
}

export async function saveItem(input) {
  const items = await getLibrary();
  const next = upsertItem(items, input);
  await saveLibrary(next);
  return next[0];
}

export async function deleteItem(id) {
  const next = (await getLibrary()).filter((item) => item.id !== id);
  return saveLibrary(next);
}

export async function toggleFavorite(id) {
  const next = (await getLibrary()).map((item) => item.id === id ? { ...item, favorite: !item.favorite, updatedAt: new Date().toISOString() } : item);
  await saveLibrary(next);
  return next.find((item) => item.id === id);
}

export async function mergeImported(items) {
  let merged = await getLibrary();
  for (const item of items) merged = upsertItem(merged, normalizeItem(item), item.updatedAt || new Date().toISOString());
  return saveLibrary(merged);
}

export async function getSettings() {
  const result = await storage().get(SETTINGS_KEY);
  const stored=result[SETTINGS_KEY]||{};
  const defaults={discreetMode:false,blurPreviews:false};
  if (!stored.previewVisibilityMigratedV031) {
    const migrated={...stored,blurPreviews:false,previewVisibilityMigratedV031:true};
    await storage().set({[SETTINGS_KEY]:migrated});
    return {...defaults,...migrated};
  }
  return {...defaults,...stored};
}

export async function saveSettings(settings) {
  await storage().set({ [SETTINGS_KEY]: settings });
  return settings;
}

export async function updateBadge(count) {
  if (!chrome.action?.setBadgeText) return;
  await chrome.action.setBadgeBackgroundColor({ color: "#ff4f87" });
  await chrome.action.setBadgeText({ text: count ? String(Math.min(count, 999)) : "" });
}
