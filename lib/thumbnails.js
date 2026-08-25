const LEGACY_DATABASE="privateflix_media_v1";
const LEGACY_STORE="thumbnails";

function openLegacyDatabase(){
  return new Promise((resolve,reject)=>{
    const request=indexedDB.open(LEGACY_DATABASE,1);
    request.onupgradeneeded=()=>{if(!request.result.objectStoreNames.contains(LEGACY_STORE))request.result.createObjectStore(LEGACY_STORE,{keyPath:"id"})};
    request.onsuccess=()=>resolve(request.result);
    request.onerror=()=>reject(request.error);
  });
}

export async function deleteThumbnail(id){
  try{
    const database=await openLegacyDatabase();
    await new Promise((resolve,reject)=>{const transaction=database.transaction(LEGACY_STORE,"readwrite");transaction.objectStore(LEGACY_STORE).delete(id);transaction.oncomplete=resolve;transaction.onerror=()=>reject(transaction.error)});
    database.close();
  }catch{/* Legacy thumbnail cleanup must not affect the library. */}
}

export async function clearThumbnails(){
  await new Promise((resolve)=>{const request=indexedDB.deleteDatabase(LEGACY_DATABASE);request.onsuccess=resolve;request.onerror=resolve;request.onblocked=resolve});
}
