// Enables a visual preview when library.html is opened outside Chrome's extension runtime.
if (!globalThis.chrome?.storage?.local) {
  const previewIcon = new URL("icons/privateflix.png", location.href).href;
  const demoItems = [
    { id: "demo-1", url: "https://example.com/character", title: "Friday favorite", source: "example.com", type: "chat", note: "A character worth returning to.", tags: ["favorite", "character"], favorite: true, createdAt: "2026-08-23T20:00:00.000Z", updatedAt: "2026-08-23T20:00:00.000Z" },
    { id: "demo-2", url: "https://example.com/video", title: "Late night find", source: "example.com", type: "video", note: "Keep this generation style for later.", tags: ["video", "prompt"], favorite: false, thumbnailUrl: previewIcon, previewUrl: "https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4", durationSeconds: 1456, quality: "1080p", width: 1920, height: 1080, createdAt: "2026-08-24T20:00:00.000Z", updatedAt: "2026-08-24T20:00:00.000Z" },
    { id: "demo-3", url: "https://example.com/image", title: "Worth another look", source: "example.com", type: "image", note: "Strong lighting and composition reference.", tags: ["image"], favorite: false, createdAt: "2026-08-25T08:00:00.000Z", updatedAt: "2026-08-25T08:00:00.000Z" }
  ];
  const memory = {
    privateflix_library_v1: demoItems,
    privateflix_settings_v1: { discreetMode: false, blurPreviews: true }
  };
  const sessionMemory = { privateflix_privacy_shield: false };
  const runtimeListeners = [];
  globalThis.chrome = {
    action: { setBadgeBackgroundColor: async () => {}, setBadgeText: async () => {} },
    runtime: {
      sendMessage: async (message) => {
        if (message?.type === "TOGGLE_PRIVACY_SHIELD") {
          sessionMemory.privateflix_privacy_shield = !sessionMemory.privateflix_privacy_shield;
          runtimeListeners.forEach((listener) => listener({ type:"PRIVACY_SHIELD_CHANGED", active:sessionMemory.privateflix_privacy_shield }));
          return { ok:true, active:sessionMemory.privateflix_privacy_shield };
        }
        return { ok: true };
      },
      onMessage: { addListener: (listener) => runtimeListeners.push(listener) }
    },
    scripting: { executeScript: async () => [{ result: { thumbnailUrl: previewIcon, previewUrl: "https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4", durationSeconds: 1456, quality: "1080p", width: 1920, height: 1080 } }] },
    tabs: { query: async () => [{ id: 1, windowId:1, url: "https://example.com/character", title: "Friday favorite" }], captureVisibleTab: async () => previewIcon },
    storage: {
      local: {
        get: async (key) => typeof key === "string" ? { [key]: memory[key] } : { ...memory },
        set: async (values) => Object.assign(memory, values)
      },
      session: {
        get: async (key) => typeof key === "string" ? { [key]: sessionMemory[key] } : { ...sessionMemory },
        set: async (values) => Object.assign(sessionMemory, values)
      },
      onChanged: { addListener: () => {} }
    }
  };
}
