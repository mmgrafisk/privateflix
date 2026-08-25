export const SHIELD_KEY = "privateflix_privacy_shield";

export async function getShieldState() {
  const result = await chrome.storage.session.get(SHIELD_KEY);
  return Boolean(result[SHIELD_KEY]);
}

export async function setShieldState(active) {
  await chrome.storage.session.set({ [SHIELD_KEY]: Boolean(active) });
  return Boolean(active);
}

function neutralFavicon() {
  const canvas = document.createElement("canvas"); canvas.width = 64; canvas.height = 64;
  const context = canvas.getContext("2d");
  context.fillStyle = "#316a68"; context.fillRect(0,0,64,64);
  context.fillStyle = "#ffffff"; context.font = "bold 23px Arial"; context.textAlign = "center"; context.textBaseline = "middle"; context.fillText("PW",32,34);
  return canvas.toDataURL("image/png");
}

export function applyShieldView(active, { privateTitle = "PrivateFlix" } = {}) {
  document.documentElement.classList.toggle("shield-active", active);
  document.title = active ? "Project Workspace" : privateTitle;
  const favicon = document.querySelector("#page-favicon");
  if (favicon) favicon.href = active ? neutralFavicon() : "icons/privateflix-32.png";
  if (active) document.querySelectorAll("video").forEach((video) => { video.pause(); video.removeAttribute("src"); video.load(); });
}

export async function toggleShield() {
  const response = await chrome.runtime.sendMessage({ type:"TOGGLE_PRIVACY_SHIELD" });
  return Boolean(response?.active);
}
