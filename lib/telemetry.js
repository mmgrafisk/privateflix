const EVENTS_URL="https://privateflix-hub.mmgrafisk.chatgpt.site/api/events";
export function recordEvent(eventType,itemId){if(!/^(guide_open|affiliate_click)$/.test(eventType)||!/^[a-z0-9][a-z0-9_-]{0,79}$/i.test(itemId))return;fetch(EVENTS_URL,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({eventType,itemId}),keepalive:true}).catch(()=>{});}
