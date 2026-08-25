const PROGRAMS_KEY = "privateflix_affiliate_programs";
const FEED_URL_KEY = "privateflix_affiliate_feed_url";
const LAST_SYNC_KEY = "privateflix_affiliate_last_sync";
const SYNC_INTERVAL = 24 * 60 * 60 * 1000;
const DEFAULT_FEED_URL = "https://raw.githubusercontent.com/mmgrafisk/privateflix/main/affiliate-programs.json";
const CATEGORIES = new Set(["network", "cam", "dating", "content", "fansite"]);
const ACCOUNT_STATUSES = new Set(["not-joined", "applied", "active", "paused"]);
let programs = [];
let defaultFeed = { version:1, updatedAt:"", programs:[] };
let feedUrl = "";
let lastSync = "";

document.addEventListener("DOMContentLoaded", init);

async function init() {
  defaultFeed = validateFeed(await fetch(chrome.runtime.getURL("affiliate-programs.json")).then((response) => response.json()));
  const stored = await chrome.storage.local.get([PROGRAMS_KEY, FEED_URL_KEY, LAST_SYNC_KEY]);
  try { programs = Array.isArray(stored[PROGRAMS_KEY]) ? validatePrograms(stored[PROGRAMS_KEY]) : clone(defaultFeed.programs); }
  catch { programs = clone(defaultFeed.programs); }
  feedUrl = typeof stored[FEED_URL_KEY] === "string" && stored[FEED_URL_KEY].trim()
    ? stored[FEED_URL_KEY].trim()
    : DEFAULT_FEED_URL;
  lastSync = typeof stored[LAST_SYNC_KEY] === "string" ? stored[LAST_SYNC_KEY] : "";
  bindEvents(); render(); updateFeedUi();
  if (feedUrl && (!Date.parse(lastSync) || Date.now() - Date.parse(lastSync) >= SYNC_INTERVAL)) syncRemoteFeed(false);
}

function bindEvents() {
  ["affiliateSearch", "affiliateCategory", "affiliateAccountStatus"].forEach((id) => document.querySelector(`#${id}`).addEventListener("input", render));
  document.querySelector("#managePrograms").addEventListener("click", openManager);
  document.querySelector("#closeManage").addEventListener("click", () => document.querySelector("#manageDialog").close());
  document.querySelector("#syncPrograms").addEventListener("click", () => syncRemoteFeed(true));
  document.querySelector("#syncFeed").addEventListener("click", () => syncRemoteFeed(true));
  document.querySelector("#saveFeed").addEventListener("click", saveFeedUrl);
  document.querySelector("#newProgram").addEventListener("click", resetProgramForm);
  document.querySelector("#cancelProgramEdit").addEventListener("click", resetProgramForm);
  document.querySelector("#programForm").addEventListener("submit", saveProgram);
  document.querySelector("#exportPrograms").addEventListener("click", exportPrograms);
  document.querySelector("#importProgramsButton").addEventListener("click", () => document.querySelector("#importPrograms").click());
  document.querySelector("#importPrograms").addEventListener("change", importPrograms);
  document.querySelector("#restoreDefaultPrograms").addEventListener("click", restoreDefaults);
}

function render() {
  const query = document.querySelector("#affiliateSearch").value.toLowerCase().trim();
  const category = document.querySelector("#affiliateCategory").value;
  const accountStatus = document.querySelector("#affiliateAccountStatus").value;
  const visible = programs.filter((program) => {
    const haystack = [program.name, program.description, program.commission, ...(program.brands || [])].join(" ").toLowerCase();
    return program.status !== "hidden" && (!query || haystack.includes(query)) && (!category || program.category === category) && (!accountStatus || program.accountStatus === accountStatus);
  }).sort((a, b) => Number(b.featured) - Number(a.featured) || a.name.localeCompare(b.name, "da"));
  document.querySelector("#affiliateTotal").textContent = programs.filter((program) => program.status === "open").length;
  document.querySelector("#affiliateUpdated").textContent = lastSync ? `Opdateret ${formatDate(lastSync)}` : `Startliste ${formatDate(defaultFeed.updatedAt)}`;
  document.querySelector("#affiliateCount").textContent = `${visible.length} ${visible.length === 1 ? "program" : "programmer"}`;
  document.querySelector("#affiliateEmpty").hidden = visible.length !== 0;
  document.querySelector("#affiliateGrid").replaceChildren(...visible.map(programCard));
  if (document.querySelector("#manageDialog").open) renderAdminList();
}

function programCard(program) {
  const article = el("article", `affiliate-card${program.featured ? " featured" : ""}${program.status === "closed" ? " closed" : ""}`);
  const head = el("div", "affiliate-card-head"); const logo = siteLogo(program); const titleBox = el("div");
  titleBox.append(el("span", "affiliate-category", categoryLabel(program.category)), el("h2", "", program.name)); head.append(logo, titleBox);
  const description = el("p", "affiliate-description", program.description || "Ingen beskrivelse endnu.");
  const commission = el("div", "commission-box"); commission.append(el("span", "", "Indtjeningsmodel"), el("strong", "", program.commission || "Se programmets aktuelle vilkår"));
  const brands = el("div", "affiliate-brand-list"); (program.brands || []).slice(0, 8).forEach((brand) => brands.append(el("span", "affiliate-brand", brand)));
  const state = el("div", "affiliate-personal-state"); state.append(el("span", "", "Min status"));
  const select = document.createElement("select"); select.setAttribute("aria-label", `Min status hos ${program.name}`);
  [["not-joined","Ikke tilmeldt"],["applied","Ansøgt"],["active","Aktiv partner"],["paused","Sat på pause"]].forEach(([value, label]) => select.append(new Option(label, value)));
  select.value = program.accountStatus; select.addEventListener("change", () => updatePersonalStatus(program.id, select.value)); state.append(select);
  const actions = el("div", "affiliate-card-actions");
  const primaryUrl = program.affiliateUrl || program.signupUrl; const primaryLabel = program.affiliateUrl ? "Åbn mit affiliatelink" : program.accountStatus === "active" ? "Åbn partnerprogram" : "Ansøg hos programmet";
  actions.append(externalLink(primaryLabel, primaryUrl, "primary"), externalLink("Besøg hjemmeside", program.websiteUrl, "secondary"));
  article.append(head, description, commission, brands, state, actions); return article;
}

function siteLogo(program) {
  const box = el("span", "affiliate-logo", program.name.charAt(0).toUpperCase());
  const url = program.logoUrl || favicon(program.websiteUrl); if (!url) return box;
  const image = new Image(); image.alt = ""; image.referrerPolicy = "no-referrer";
  image.addEventListener("load", () => { box.textContent = ""; box.append(image); }, { once:true }); image.src = url; return box;
}

function externalLink(label, url, className) {
  const link = el("a", className, label); link.href = url; link.target = "_blank"; link.rel = "noopener noreferrer"; return link;
}

async function updatePersonalStatus(id, accountStatus) {
  const program = programs.find((entry) => entry.id === id); if (!program || !ACCOUNT_STATUSES.has(accountStatus)) return;
  program.accountStatus = accountStatus; await persist(); render();
}

function openManager() {
  document.querySelector("#feedUrl").value = feedUrl; resetProgramForm(); renderAdminList(); updateFeedUi(); document.querySelector("#manageDialog").showModal();
}

function renderAdminList() {
  const list = document.querySelector("#adminProgramList");
  list.replaceChildren(...[...programs].sort((a, b) => a.name.localeCompare(b.name, "da")).map((program) => {
    const row = el("div", "admin-program-row"); const text = el("div"); text.append(el("strong", "", program.name), el("small", "", `${categoryLabel(program.category)} · ${accountStatusLabel(program.accountStatus)}`));
    const actions = el("div", "admin-program-row-actions");
    actions.append(smallButton("Redigér", () => editProgram(program.id)), smallButton("Slet", () => deleteProgram(program.id), "danger")); row.append(text, actions); return row;
  }));
}

function editProgram(id) {
  const program = programs.find((entry) => entry.id === id); if (!program) return;
  document.querySelector("#programId").value = program.id;
  document.querySelector("#programName").value = program.name;
  document.querySelector("#programCategory").value = program.category;
  document.querySelector("#programAccountStatus").value = program.accountStatus;
  document.querySelector("#programWebsite").value = program.websiteUrl;
  document.querySelector("#programSignup").value = program.signupUrl;
  document.querySelector("#programAffiliateUrl").value = program.affiliateUrl || "";
  document.querySelector("#programCommission").value = program.commission || "";
  document.querySelector("#programBrands").value = (program.brands || []).join(", ");
  document.querySelector("#programDescription").value = program.description || "";
  document.querySelector("#programFeatured").checked = program.featured;
  document.querySelector("#programFormHeading").textContent = `Redigér ${program.name}`;
  document.querySelector("#programName").focus();
}

function resetProgramForm() {
  document.querySelector("#programForm").reset(); document.querySelector("#programId").value = ""; document.querySelector("#programAccountStatus").value = "not-joined"; document.querySelector("#programFormHeading").textContent = "Tilføj program";
}

async function saveProgram(event) {
  event.preventDefault();
  try {
    const existingId = document.querySelector("#programId").value;
    const websiteUrl = requireHttpUrl(document.querySelector("#programWebsite").value);
    const signupUrl = requireHttpUrl(document.querySelector("#programSignup").value);
    const affiliateValue = document.querySelector("#programAffiliateUrl").value.trim();
    const program = validateProgram({
      id:existingId || uniqueId(document.querySelector("#programName").value), name:document.querySelector("#programName").value,
      category:document.querySelector("#programCategory").value, accountStatus:document.querySelector("#programAccountStatus").value,
      websiteUrl, signupUrl, affiliateUrl:affiliateValue ? requireHttpUrl(affiliateValue) : "", commission:document.querySelector("#programCommission").value,
      brands:commaList(document.querySelector("#programBrands").value), description:document.querySelector("#programDescription").value,
      featured:document.querySelector("#programFeatured").checked, status:"open", localOnly:true, updatedAt:new Date().toISOString()
    });
    const index = programs.findIndex((entry) => entry.id === program.id); if (index >= 0) programs[index] = program; else programs.push(program);
    await persist(); resetProgramForm(); renderAdminList(); render();
  } catch (error) { alert(error.message || "Programmet kunne ikke gemmes."); }
}

async function deleteProgram(id) {
  const program = programs.find((entry) => entry.id === id); if (!program || !confirm(`Slet ${program.name} fra kataloget?`)) return;
  programs = programs.filter((entry) => entry.id !== id); await persist(); resetProgramForm(); renderAdminList(); render();
}

async function saveFeedUrl() {
  const value = document.querySelector("#feedUrl").value.trim();
  try { feedUrl = value ? requireHttpsUrl(value) : ""; await chrome.storage.local.set({ [FEED_URL_KEY]:feedUrl }); setFeedMessage(feedUrl ? "Feed-adressen er gemt." : "Feed-adressen er fjernet."); updateFeedUi(); }
  catch (error) { setFeedMessage(error.message, true); }
}

async function syncRemoteFeed(manual) {
  if (!feedUrl) { if (manual) { openManager(); setFeedMessage("Tilføj først en HTTPS-adresse til dit JSON-feed.", true); } return; }
  const buttons = [document.querySelector("#syncPrograms"), document.querySelector("#syncFeed")]; buttons.forEach((button) => { button.disabled = true; button.textContent = "Henter…"; });
  setSyncState("Kontrollerer feed…"); setFeedMessage("Henter og validerer feed…");
  try {
    const response = await fetch(feedUrl, { cache:"no-store", credentials:"omit", redirect:"follow" });
    if (!response.ok) throw new Error(`Feedet svarede med HTTP ${response.status}`);
    const text = await response.text(); if (text.length > 1_000_000) throw new Error("Feedet er større end 1 MB.");
    const remote = validateFeed(JSON.parse(text)); programs = mergeRemotePrograms(remote.programs, programs); lastSync = new Date().toISOString();
    await chrome.storage.local.set({ [PROGRAMS_KEY]:programs, [LAST_SYNC_KEY]:lastSync });
    setSyncState(`${remote.programs.length} programmer opdateret`); setFeedMessage(`Feedet blev godkendt. ${remote.programs.length} programmer blev opdateret.`); render(); updateFeedUi();
  } catch (error) { setSyncState("Opdatering mislykkedes", true); setFeedMessage(`Listen blev ikke ændret: ${error.message}`, true); }
  finally { buttons[0].disabled = false; buttons[0].textContent = "Hent opdateringer"; buttons[1].disabled = false; buttons[1].textContent = "Hent nu"; }
}

function exportPrograms() {
  const data = { version:1, updatedAt:new Date().toISOString(), programs };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type:"application/json" }); const url = URL.createObjectURL(blob); const link = document.createElement("a");
  link.href = url; link.download = "affiliate-programs.json"; link.click(); URL.revokeObjectURL(url);
}

async function importPrograms(event) {
  const file = event.target.files[0]; if (!file) return;
  try {
    const imported = validateFeed(JSON.parse(await file.text())); if (!confirm(`Indlæs ${imported.programs.length} programmer og erstat den nuværende lokale liste?`)) return;
    programs = imported.programs; await persist(); resetProgramForm(); renderAdminList(); render(); setFeedMessage("JSON-filen blev importeret.");
  } catch (error) { alert(`Filen blev ikke indlæst: ${error.message}`); }
  finally { event.target.value = ""; }
}

async function restoreDefaults() {
  if (!confirm("Gendan den indbyggede startliste? Lokale programændringer bliver erstattet.")) return;
  programs = clone(defaultFeed.programs); await persist(); resetProgramForm(); renderAdminList(); render(); setFeedMessage("Startlisten er gendannet.");
}

function validateFeed(value) {
  const list = Array.isArray(value) ? value : value?.programs; if (!Array.isArray(list)) throw new Error("JSON-feedet mangler programs-listen.");
  if (list.length > 500) throw new Error("Feedet må højst indeholde 500 programmer.");
  const programs = validatePrograms(list); const ids = new Set(); programs.forEach((program) => { if (ids.has(program.id)) throw new Error(`Dublet-id: ${program.id}`); ids.add(program.id); });
  return { version:Number(value?.version || 1), updatedAt:validDate(value?.updatedAt) ? value.updatedAt : "", programs };
}

function mergeRemotePrograms(remotePrograms, currentPrograms) {
  const personal = new Map(currentPrograms.map((program) => [program.id, program]));
  const synced = remotePrograms.map((program) => ({ ...program, affiliateUrl:personal.get(program.id)?.affiliateUrl || "", accountStatus:personal.get(program.id)?.accountStatus || "not-joined", localOnly:false }));
  const localOnly = currentPrograms.filter((program) => program.localOnly && !synced.some((remoteProgram) => remoteProgram.id === program.id));
  return [...synced, ...localOnly];
}

function validatePrograms(values) { return values.map(validateProgram); }
function validateProgram(value, index = 0) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`Ugyldigt program ${index + 1}`);
  const id = String(value.id || "").trim(); const name = clean(value.name, 100); if (!/^[a-z0-9][a-z0-9_-]{1,79}$/i.test(id) || !name) throw new Error(`Ugyldigt id eller navn i program ${index + 1}`);
  const category = CATEGORIES.has(value.category) ? value.category : "network";
  const websiteUrl = requireHttpUrl(value.websiteUrl); const signupUrl = requireHttpUrl(value.signupUrl || value.websiteUrl);
  const affiliateUrl = value.affiliateUrl ? requireHttpUrl(value.affiliateUrl) : ""; const logoUrl = value.logoUrl ? requireHttpUrl(value.logoUrl) : "";
  const brands = Array.isArray(value.brands) ? [...new Set(value.brands.map((brand) => clean(brand, 60)).filter(Boolean))].slice(0, 20) : [];
  return { id, name, category, websiteUrl, signupUrl, affiliateUrl, logoUrl, description:clean(value.description, 500), commission:clean(value.commission, 180), brands,
    status:["open","closed","hidden"].includes(value.status) ? value.status : "open", accountStatus:ACCOUNT_STATUSES.has(value.accountStatus) ? value.accountStatus : "not-joined",
    featured:Boolean(value.featured), localOnly:Boolean(value.localOnly), sourceUrl:value.sourceUrl ? requireHttpUrl(value.sourceUrl) : "", updatedAt:validDate(value.updatedAt) ? value.updatedAt : "" };
}

function updateFeedUi() {
  document.querySelector("#feedUrl").value = feedUrl; document.querySelector("#feedLastSync").textContent = lastSync ? `Senest ${formatDate(lastSync)}` : "Ikke synkroniseret";
}
function setFeedMessage(text, error = false) { const node = document.querySelector("#feedMessage"); node.textContent = text; node.classList.toggle("error", error); }
function setSyncState(text, error = false) { const node = document.querySelector("#syncState"); node.textContent = text; node.classList.toggle("error", error); }
async function persist() { await chrome.storage.local.set({ [PROGRAMS_KEY]:programs }); }
function smallButton(text, handler, extra = "") { const button = el("button", `mini-button ${extra}`, text); button.type = "button"; button.addEventListener("click", handler); return button; }
function categoryLabel(value) { return ({network:"Netværk",cam:"Cam",dating:"Dating",content:"Adult content",fansite:"Fansite"})[value] || "Andet"; }
function accountStatusLabel(value) { return ({"not-joined":"Ikke tilmeldt",applied:"Ansøgt",active:"Aktiv partner",paused:"Sat på pause"})[value] || "Ikke tilmeldt"; }
function commaList(value) { return [...new Set(String(value || "").split(",").map((entry) => entry.trim()).filter(Boolean))]; }
function requireHttpUrl(value) { try { const url = new URL(String(value || "").trim()); if (!/^https?:$/.test(url.protocol)) throw new Error(); return url.href; } catch { throw new Error("Alle programlinks skal være gyldige http- eller https-adresser."); } }
function requireHttpsUrl(value) { const url = requireHttpUrl(value); if (!url.startsWith("https://")) throw new Error("Det eksterne feed skal bruge HTTPS."); return url; }
function favicon(value) { try { return new URL("/favicon.ico", value).href; } catch { return ""; } }
function clean(value, max) { return typeof value === "string" ? value.trim().slice(0, max) : ""; }
function validDate(value) { return typeof value === "string" && Number.isFinite(Date.parse(value)); }
function formatDate(value) { const date = new Date(value); return Number.isFinite(date.getTime()) ? date.toLocaleDateString("da-DK", { day:"numeric", month:"short", year:"numeric" }) : "ukendt"; }
function uniqueId(name) { const base = String(name || "program").normalize("NFKD").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 55) || "program"; let id = base; let suffix = 2; while (programs.some((program) => program.id === id)) id = `${base}-${suffix++}`; return id; }
function clone(value) { return JSON.parse(JSON.stringify(value)); }
function el(tag, className = "", text) { const node = document.createElement(tag); if (className) node.className = className; if (text !== undefined) node.textContent = text; return node; }
