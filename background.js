import { getLibrary, getSettings, saveItem, saveLibrary, updateBadge } from "./lib/storage.js";
import { inferType } from "./lib/model.js";
import { extractTabMetadata } from "./lib/page-metadata.js";
import { fetchRemoteMetadata } from "./lib/remote-metadata.js";
import { getShieldState, setShieldState } from "./lib/shield.js";
import { clearThumbnails } from "./lib/thumbnails.js";

const MENU_ID = "save-to-privateflix";
let mediaRefreshPromise=null;

const delay=(milliseconds)=>new Promise((resolve)=>setTimeout(resolve,milliseconds));
function hasUsefulMedia(metadata){return Boolean(metadata?.thumbnailUrl||metadata?.previewUrl||metadata?.durationSeconds||metadata?.quality||metadata?.width||metadata?.height||metadata?.actors?.length);}
function mediaHostPatterns(values){return values.flat().map((value)=>{try{const url=new URL(value);return /^https?:$/.test(url.protocol)?`${url.protocol}//${url.host}/*`:""}catch{return""}}).filter((value,index,list)=>value&&list.indexOf(value)===index)}
async function requestMediaAccess(values){const origins=mediaHostPatterns(values);if(!origins.length||await chrome.permissions.contains({origins}))return true;try{return await chrome.permissions.request({origins})}catch{return false}}

function waitForTab(tabId,timeout=18000){
  return new Promise((resolve)=>{
    let finished=false;
    const done=(loaded)=>{if(finished)return;finished=true;clearTimeout(timer);chrome.tabs.onUpdated.removeListener(updated);chrome.tabs.onRemoved.removeListener(removed);resolve(loaded)};
    const updated=(id,change)=>{if(id===tabId&&change.status==="complete")done(true)};
    const removed=(id)=>{if(id===tabId)done(false)};
    const timer=setTimeout(()=>done(false),timeout);
    chrome.tabs.onUpdated.addListener(updated);chrome.tabs.onRemoved.addListener(removed);
    chrome.tabs.get(tabId).then((tab)=>{if(tab.status==="complete")done(true)}).catch(()=>done(false));
  });
}

async function createMediaScanTarget(){
  const tab=await chrome.tabs.create({url:"about:blank",active:false});
  return{tab,close:()=>chrome.tabs.remove(tab.id)};
}

async function refreshLibraryMedia(){
  const items=await getLibrary();let updatedCount=0,postersFound=0,previewsFound=0,detailsUpdated=0,unavailable=0;const next=[];
  let target=null;
  try{for(let index=0;index<items.length;index+=1){
      const item=items[index];chrome.runtime.sendMessage({type:"MEDIA_REFRESH_PROGRESS",current:index+1,total:items.length,title:item.title}).catch(()=>{});
      try{
        if(!/^https?:\/\//i.test(item.url)){unavailable+=1;next.push(item);continue}
        let metadata=await fetchRemoteMetadata(item.url);
        if(!metadata.thumbnailUrl||!hasUsefulMedia(metadata)){
          target ||= await createMediaScanTarget();
          target.tab=await chrome.tabs.update(target.tab.id,{url:item.url,active:false});
          if(await waitForTab(target.tab.id)){
            await delay(1200);let pageMetadata=await extractTabMetadata(target.tab.id);
            if(!hasUsefulMedia(pageMetadata)){await delay(1000);pageMetadata=await extractTabMetadata(target.tab.id)}
            metadata={
              thumbnailUrl:metadata.thumbnailUrl||pageMetadata.thumbnailUrl,
              previewUrl:pageMetadata.previewUrl||metadata.previewUrl,
              siteIconUrl:metadata.siteIconUrl||pageMetadata.siteIconUrl,
              actors:metadata.actors?.length?metadata.actors:pageMetadata.actors,
              durationSeconds:metadata.durationSeconds||pageMetadata.durationSeconds,
              quality:metadata.quality||pageMetadata.quality,
              width:metadata.width||pageMetadata.width,
              height:metadata.height||pageMetadata.height
            };
          }
        }
        const foundPreview=Boolean(metadata.previewUrl);const foundDetails=Boolean(metadata.durationSeconds||metadata.quality||metadata.actors?.length||metadata.siteIconUrl);
        if(!metadata.thumbnailUrl&&!foundPreview&&!foundDetails){unavailable+=1;next.push(item);continue}
        const updated={...item,thumbnailUrl:metadata.thumbnailUrl||item.thumbnailUrl,previewUrl:metadata.previewUrl||item.previewUrl,siteIconUrl:metadata.siteIconUrl||item.siteIconUrl,actors:metadata.actors?.length?metadata.actors:item.actors,durationSeconds:metadata.durationSeconds||item.durationSeconds,quality:metadata.quality||item.quality,width:metadata.width||item.width,height:metadata.height||item.height,type:item.type==="link"&&(metadata.previewUrl||metadata.durationSeconds)?"video":item.type,updatedAt:new Date().toISOString()};
        next.push(updated);updatedCount+=1;if(metadata.thumbnailUrl)postersFound+=1;if(foundPreview)previewsFound+=1;if(foundDetails)detailsUpdated+=1;
      }catch{unavailable+=1;next.push(item)}
    }}finally{if(target)await target.close().catch(()=>{})}
  await saveLibrary(next);return{ok:true,total:items.length,updated:updatedCount,postersFound,previewsFound,detailsUpdated,unavailable};
}

chrome.runtime.onInstalled.addListener(async () => {
  await chrome.contextMenus.removeAll();
  chrome.contextMenus.create({ id: MENU_ID, title: "Save to PrivateFlix", contexts: ["page", "link", "selection"] });
  await getSettings();
  await clearThumbnails().catch(()=>{});
  await updateBadge((await getLibrary()).length);
  await setShieldState(false);
});

chrome.runtime.onStartup.addListener(async () => { await setShieldState(false); await applyActionAppearance(false); await updateBadge((await getLibrary()).length); });

function workspaceIcon(size) {
  const canvas=new OffscreenCanvas(size,size); const context=canvas.getContext("2d");
  context.fillStyle="#316a68"; context.fillRect(0,0,size,size); context.fillStyle="#fff"; context.font=`bold ${Math.max(7,Math.round(size*.34))}px Arial`; context.textAlign="center"; context.textBaseline="middle"; context.fillText("PW",size/2,size*.54); return context.getImageData(0,0,size,size);
}

async function applyActionAppearance(active) {
  if (active) {
    await chrome.action.setIcon({ imageData:{ 16:workspaceIcon(16), 32:workspaceIcon(32), 48:workspaceIcon(48), 128:workspaceIcon(128) } });
    await chrome.action.setTitle({ title:"Project Workspace" }); await chrome.action.setBadgeText({text:""});
  } else {
    await chrome.action.setIcon({ path:{16:"icons/privateflix-16.png",32:"icons/privateflix-32.png",48:"icons/privateflix-48.png",128:"icons/privateflix-128.png"} });
    await chrome.action.setTitle({ title:"Save to PrivateFlix" }); await updateBadge((await getLibrary()).length);
  }
}

async function togglePrivacyShield() {
  const active=await setShieldState(!(await getShieldState())); await applyActionAppearance(active);
  chrome.runtime.sendMessage({type:"PRIVACY_SHIELD_CHANGED",active}).catch(()=>{}); return active;
}

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== MENU_ID) return;
  if (info.linkUrl) {
    await requestMediaAccess([info.linkUrl]);
    const media=await fetchRemoteMetadata(info.linkUrl);
    await requestMediaAccess([media.thumbnailUrl,media.previewUrl,media.siteIconUrl]);
    await saveItem({ url: info.linkUrl, title: info.selectionText || "Saved link", type: inferType(info.linkUrl), ...media });
  } else {
    const media = await extractTabMetadata(tab?.id);
    await requestMediaAccess([tab?.url,media.thumbnailUrl,media.previewUrl,media.siteIconUrl]);
    await saveItem({
      url: tab?.url,
      title: tab?.title || "Saved page",
      type: inferType(`${tab?.title || ""} ${tab?.url || ""}`),
      note: info.selectionText || "",
      tags: info.selectionText ? ["prompt"] : [],
      ...media
    });
  }
});

chrome.commands.onCommand.addListener(async (command) => {
  if (command === "open-private-library") await chrome.tabs.create({ url: chrome.runtime.getURL("library.html") });
  if (command === "toggle-privacy-shield") await togglePrivacyShield();
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "OPEN_LIBRARY") {
    chrome.tabs.create({ url: chrome.runtime.getURL("library.html") });
    sendResponse({ ok: true });
  }
  if (message?.type === "TOGGLE_PRIVACY_SHIELD") {
    togglePrivacyShield().then((active)=>sendResponse({ok:true,active}));
    return true;
  }
  if (message?.type === "GET_PRIVACY_SHIELD") {
    getShieldState().then((active)=>sendResponse({ok:true,active}));
    return true;
  }
  if (message?.type === "REFRESH_LIBRARY_MEDIA") {
    mediaRefreshPromise ||= refreshLibraryMedia().finally(()=>{mediaRefreshPromise=null});
    mediaRefreshPromise.then(sendResponse).catch(()=>sendResponse({ok:false,error:"Media refresh could not finish."}));
    return true;
  }
  return false;
});
