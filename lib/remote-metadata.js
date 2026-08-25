const decodeHtml=(value)=>String(value||"")
  .replace(/&amp;/gi,"&").replace(/&quot;/gi,'"').replace(/&#39;|&apos;/gi,"'")
  .replace(/&lt;/gi,"<").replace(/&gt;/gi,">");

const attribute=(tag,name)=>tag.match(new RegExp(`\\s${name}\\s*=\\s*(?:["']([^"']*)["']|([^\\s>]+))`,"i"))?.[1]||tag.match(new RegExp(`\\s${name}\\s*=\\s*(?:["']([^"']*)["']|([^\\s>]+))`,"i"))?.[2]||"";
const absoluteUrl=(value,base)=>{try{const url=new URL(String(value||"").replace(/\\u0026/g,"&").replace(/\\\//g,"/"),base);return /^https?:$/.test(url.protocol)?url.href:""}catch{return""}};
const unique=(values,limit=30)=>[...new Set(values.flat(Infinity).map((value)=>String(value||"").replace(/\s+/g," ").trim()).filter(Boolean))].slice(0,limit);
const toList=(value)=>value==null?[]:Array.isArray(value)?value:typeof value==="string"?value.split(",").map((item)=>item.trim()):[value];
const entityName=(value)=>typeof value==="string"?value.trim():value?.name?.trim?.()||"";

function parseDuration(value){
  if(typeof value==="number"&&Number.isFinite(value)&&value>0)return Math.round(value);
  const text=String(value||"").trim();
  if(/^\d+(?:\.\d+)?$/.test(text))return Math.round(Number(text));
  const iso=text.match(/^P(?:([\d.]+)D)?(?:T(?:([\d.]+)H)?(?:([\d.]+)M)?(?:([\d.]+)S)?)?$/i);
  if(iso)return Math.round(Number(iso[1]||0)*86400+Number(iso[2]||0)*3600+Number(iso[3]||0)*60+Number(iso[4]||0));
  const clock=text.match(/^(?:(\d+):)?(\d{1,2}):(\d{2})$/);
  return clock?Number(clock[1]||0)*3600+Number(clock[2])*60+Number(clock[3]):0;
}

function qualityRank(value){const text=String(value||"");return /8k|4320/i.test(text)?4320:/4k|2160|uhd/i.test(text)?2160:/2k|1440|qhd/i.test(text)?1440:Number(text.match(/\d{3,4}/)?.[0]||0)}
function bestQuality(...values){return values.flat(Infinity).filter(Boolean).sort((a,b)=>qualityRank(b)-qualityRank(a))[0]||""}

function metaReader(html){
  const values=new Map();
  for(const match of html.matchAll(/<meta\s+[^>]*>/gi)){
    const tag=match[0];const key=(attribute(tag,"property")||attribute(tag,"name")||attribute(tag,"itemprop")).toLowerCase();const value=decodeHtml(attribute(tag,"content"));
    if(!key||!value)continue;
    if(["video:tag","article:tag","keywords","video:actor","video:performer","actor","performer"].includes(key)&&values.has(key))values.set(key,`${values.get(key)},${value}`);
    else if(!values.has(key))values.set(key,value);
  }
  const read=(...keys)=>keys.map((key)=>values.get(key)).find(Boolean)||"";
  read.all=(...keys)=>unique(keys.flatMap((key)=>(values.get(key)||"").split(",")));
  return read;
}

function structuredMetadata(html){
  const result={title:"",thumbnailUrl:"",previewUrl:"",actors:[],durationSeconds:0,quality:"",width:0,height:0};
  for(const match of html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)){
    try{
      const parsed=JSON.parse(match[1]);const roots=Array.isArray(parsed)?parsed:parsed?.["@graph"]||[parsed];
      for(const node of roots){
        if(!node||typeof node!=="object")continue;
        result.title ||= node.name||node.headline||"";
        const image=Array.isArray(node.thumbnailUrl)?node.thumbnailUrl[0]:node.thumbnailUrl||node.image?.url||node.image||"";
        if(typeof image==="string")result.thumbnailUrl ||= image;
        result.previewUrl ||= node.contentUrl||"";
        result.durationSeconds ||= parseDuration(node.duration);
        result.width ||= Math.round(Number(node.width||0));result.height ||= Math.round(Number(node.height||0));
        result.quality=bestQuality(result.quality,node.videoQuality,node.height?`${node.height}p`:"",toList(node.encoding).map((encoding)=>encoding?.height?`${encoding.height}p`:encoding?.videoQuality||""));
        result.actors.push(...[...toList(node.actor),...toList(node.actors),...toList(node.performer),...toList(node.performers)].map(entityName));
      }
    }catch{/* Ignore invalid publisher JSON-LD. */}
  }
  result.actors=unique(result.actors,12);return result;
}

function siteIcon(html,base){
  for(const match of html.matchAll(/<link\s+[^>]*>/gi)){
    const tag=match[0],rel=attribute(tag,"rel").toLowerCase(),href=attribute(tag,"href");
    if(href&&/(?:^|\s)(?:shortcut\s+icon|icon|apple-touch-icon)(?:\s|$)/i.test(rel)){const url=absoluteUrl(href,base);if(url)return url}
  }
  return absoluteUrl("/favicon.ico",base);
}

function previewCandidates(html,meta,structured,base){
  const values=[meta("og:video:secure_url","og:video:url","og:video","twitter:player:stream"),structured.previewUrl];
  for(const match of html.matchAll(/(?:data-(?:preview|video-preview|preview-video|trailer|webm|mp4)|data-mediabook|video_url|preview_url)\s*=\s*["']([^"']+)["']/gi))values.push(decodeHtml(match[1]));
  return unique(values.map((value)=>absoluteUrl(value,base)),6).filter((value)=>/\.(?:mp4|webm|ogv|m3u8)(?:$|[?#])/i.test(value));
}

export async function fetchRemoteMetadata(url,timeoutMs=10000){
  if(!/^https?:\/\//i.test(String(url||"")))return{};
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeoutMs);
  try{
    const response=await fetch(url,{redirect:"follow",credentials:"omit",cache:"no-store",signal:controller.signal});
    if(!response.ok||!(response.headers.get("content-type")||"").toLowerCase().includes("text/html"))return{};
    const base=response.url||url,html=(await response.text()).slice(0,2_000_000),meta=metaReader(html),structured=structuredMetadata(html);
    const thumbnailUrl=absoluteUrl(meta("og:image:secure_url","og:image","og:image:url","twitter:image","twitter:image:src")||structured.thumbnailUrl,base);
    const previews=previewCandidates(html,meta,structured,base);
    const height=Math.round(Number(meta("og:video:height")||structured.height||0)),width=Math.round(Number(meta("og:video:width")||structured.width||0));
    const qualityMatches=[...html.matchAll(/(?:data-(?:quality|resolution|height)|videoQuality|quality|resolution)\s*[=:]\s*["']?\s*(4320p|2160p|1440p|1080p|720p|480p|4K|8K|UHD)\b/gi)].map((match)=>match[1]);
    return{
      thumbnailUrl,
      previewUrl:previews[0]||"",
      siteIconUrl:siteIcon(html,base),
      actors:unique([...meta.all("video:actor","video:performer","actor","performer"),...structured.actors],12),
      durationSeconds:structured.durationSeconds||parseDuration(meta("video:duration","og:video:duration","duration")),
      quality:bestQuality(structured.quality,meta("video:quality","og:video:quality","quality"),qualityMatches,height?`${height}p`:""),
      width,height
    };
  }catch{return{}}
  finally{clearTimeout(timer)}
}
