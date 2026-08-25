export const GUIDES_URL = "https://privateflix-hub.mmgrafisk.chatgpt.site/api/guides";
const CACHE_KEY = "privateflix_guides_cache_v1";
function valid(value){return value?.version===1&&Array.isArray(value.guides)}
export async function getGuides(){try{const response=await fetch(GUIDES_URL,{cache:"no-store"});if(!response.ok)throw new Error();const data=await response.json();if(!valid(data))throw new Error();await chrome.storage.local.set({[CACHE_KEY]:data});return{data,cached:false}}catch(error){const stored=await chrome.storage.local.get(CACHE_KEY);if(valid(stored[CACHE_KEY]))return{data:stored[CACHE_KEY],cached:true};throw error}}
