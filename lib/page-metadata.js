export function extractPageMetadata() {
  const validUrl = (value) => {
    try {
      const url = new URL(String(value || "").trim(), document.baseURI);
      return /^https?:$/.test(url.protocol) ? url.href : "";
    } catch {
      return "";
    }
  };
  const firstValidUrl = (...values) => {
    for (const value of values.flat(Infinity)) {
      const url=validUrl(value);
      if(url)return url;
    }
    return "";
  };
  const firstValidVideoUrl = (...values) => {
    for (const value of values.flat(Infinity)) {
      const url=validUrl(value);
      if(url&&/\.(?:mp4|webm|ogv|m3u8)(?:$|[?#])/i.test(url))return url;
    }
    return "";
  };

  const meta = (...names) => {
    for (const name of names) {
      const element = document.querySelector(`meta[property="${name}"],meta[name="${name}"]`);
      const value = element?.getAttribute("content")?.trim();
      if (value) return value;
    }
    return "";
  };

  const parseDuration = (value) => {
    if (typeof value === "number" && Number.isFinite(value) && value > 0) return Math.round(value);
    const text = String(value || "").trim();
    if (/^\d+(?:\.\d+)?$/.test(text)) return Math.round(Number(text));
    const iso = text.match(/^P(?:([\d.]+)D)?(?:T(?:([\d.]+)H)?(?:([\d.]+)M)?(?:([\d.]+)S)?)?$/i);
    if (iso) return Math.round((Number(iso[1] || 0) * 86400) + (Number(iso[2] || 0) * 3600) + (Number(iso[3] || 0) * 60) + Number(iso[4] || 0));
    const clock = text.match(/^(?:(\d+):)?(\d{1,2}):(\d{2})$/);
    if (clock) return (Number(clock[1] || 0) * 3600) + (Number(clock[2]) * 60) + Number(clock[3]);
    return 0;
  };

  const flattenJsonLd = (value, output = []) => {
    if (!value || typeof value !== "object") return output;
    if (Array.isArray(value)) {
      value.slice(0, 50).forEach((item) => flattenJsonLd(item, output));
      return output;
    }
    output.push(value);
    if (value["@graph"]) flattenJsonLd(value["@graph"], output);
    return output;
  };

  const jsonObjects = [];
  for (const script of [...document.querySelectorAll('script[type="application/ld+json"]')].slice(0, 20)) {
    try { flattenJsonLd(JSON.parse(script.textContent || ""), jsonObjects); } catch { /* Ignore malformed publisher data. */ }
  }
  const videoObject = jsonObjects.find((entry) => String(entry?.["@type"] || "").toLowerCase().includes("videoobject")) || {};
  const imageObject = jsonObjects.find((entry) => String(entry?.["@type"] || "").toLowerCase().includes("imageobject")) || {};

  const actorValues=[];
  const collectActors=(value)=>{
    if(Array.isArray(value)){value.forEach(collectActors);return}
    const name=typeof value==="object"?value?.name:value;
    const cleaned=String(name||"").replace(/\s+/g," ").trim();
    if(cleaned.length>=2&&cleaned.length<=80)actorValues.push(cleaned);
  };
  collectActors(videoObject.actor);collectActors(videoObject.actors);
  document.querySelectorAll('meta[property="video:actor"],meta[property="og:video:actor"],meta[name="video:actor"],meta[name="actor"]')
    .forEach((element)=>collectActors(element.getAttribute("content")));
  document.querySelectorAll('[itemprop="actor"],[itemprop="actors"],[data-performer],[data-actor],a[href*="/pornstar/"],a[href*="/performer/"],a[href*="/model/"]')
    .forEach((element)=>collectActors(element.getAttribute("data-performer")||element.getAttribute("data-actor")||element.getAttribute("content")||element.textContent));
  const actors=[...new Set(actorValues)].slice(0,12);
  const siteIconUrl=firstValidUrl(
    [...document.querySelectorAll('link[rel~="icon"],link[rel="apple-touch-icon"],link[rel="shortcut icon"]')].map((element)=>element.href),
    new URL("/favicon.ico",location.origin).href
  );

  const videos = [...document.querySelectorAll("video")].slice(0, 20);
  const video = videos.sort((a, b) => ((b.videoWidth || b.clientWidth) * (b.videoHeight || b.clientHeight)) - ((a.videoWidth || a.clientWidth) * (a.videoHeight || a.clientHeight)))[0];
  const sourceElements=[...(video?.querySelectorAll("source[src]")||[])];
  const directSources=sourceElements.filter((source)=>/video\/(?:mp4|webm|ogg)/i.test(source.type||"")||/\.(?:mp4|webm|ogv)(?:$|[?#])/i.test(source.src||""));
  const resourceVideos=performance.getEntriesByType?.("resource")
    ?.map((entry)=>entry.name)
    .filter((url)=>/\.(?:mp4|webm|ogv)(?:$|[?#])/i.test(url))
    .slice(-20)
    .reverse()||[];
  const thumbnailUrl=firstValidUrl(video?.poster,videoObject.thumbnailUrl,imageObject.contentUrl,meta("og:image:secure_url", "og:image", "twitter:image"));
  const previewUrl=firstValidUrl(
    directSources.map((source)=>source.src),
    video?.currentSrc,
    video?.src,
    sourceElements.map((source)=>source.src)
  )||firstValidVideoUrl(
    resourceVideos,
    videoObject.contentUrl,
    meta("og:video:secure_url", "og:video:url", "og:video")
  );
  const durationValue = video?.duration || videoObject.duration || meta("video:duration", "og:video:duration") || document.querySelector('[itemprop="duration"]')?.getAttribute("content");
  const width = Math.round(Number(video?.videoWidth || videoObject.width || meta("og:video:width") || 0));
  const height = Math.round(Number(video?.videoHeight || videoObject.height || meta("og:video:height") || 0));

  let quality = meta("video:quality", "og:video:quality");
  if (!quality) {
    const qualityText = [...document.querySelectorAll("[data-quality], [aria-label*='quality' i]")]
      .slice(0, 40)
      .map((element) => `${element.getAttribute("data-quality") || ""} ${element.getAttribute("aria-label") || ""} ${element.textContent || ""}`)
      .join(" ");
    quality = qualityText.match(/\b(?:8K|4K|2160p|1440p|1080p|720p|480p|360p)\b/i)?.[0] || "";
  }
  if (!quality && height) quality = height >= 2160 ? "4K" : height >= 1440 ? "1440p" : height >= 1080 ? "1080p" : height >= 720 ? "720p" : `${height}p`;

  const rect = video?.getBoundingClientRect?.();
  const capture = rect && rect.width > 80 && rect.height > 50 ? {
    x: Math.max(0, rect.left), y: Math.max(0, rect.top),
    width: Math.min(rect.width, window.innerWidth - Math.max(0, rect.left)),
    height: Math.min(rect.height, window.innerHeight - Math.max(0, rect.top)),
    viewportWidth: window.innerWidth, viewportHeight: window.innerHeight
  } : null;

  return {
    thumbnailUrl,
    previewUrl,
    siteIconUrl,
    actors,
    durationSeconds: parseDuration(durationValue),
    quality: String(quality || "").trim().slice(0, 32),
    width: Number.isFinite(width) && width > 0 ? width : 0,
    height: Number.isFinite(height) && height > 0 ? height : 0,
    capture
  };
}

export async function extractTabMetadata(tabId) {
  if (!tabId || !chrome.scripting?.executeScript) return {};
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func: extractPageMetadata
    });
    return results?.[0]?.result || {};
  } catch {
    return {};
  }
}
