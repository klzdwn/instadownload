// pages/api/extract.js
import fetch from 'node-fetch';

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Use POST" });

  try {
    const { url } = req.body || {};
    if (!url) return res.status(400).json({ error: "URL missing" });

    // normalize
    let igUrl = url;
    if (!/^https?:\/\//.test(igUrl)) igUrl = 'https://' + igUrl;

    // try direct fetch with browser-like UA
    async function fetchHtml(target) {
      const r = await fetch(target, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115 Safari/537.36",
          "Accept-Language": "en-US,en;q=0.9"
        },
        redirect: 'follow',
        timeout: 10000
      });
      const txt = await r.text();
      return { ok: r.ok, status: r.status, text: txt, url: r.url };
    }

    // 1) try Instagram page directly
    let fetched = await fetchHtml(igUrl);

    // 2) if Instagram returns a "non-json / blocked" HTML, try jina.ai proxy (fallback)
    if (!fetched.ok || /DOCTYPE html/.test(fetched.text) && !(/og:video|og:image|application\/ld\+json/.test(fetched.text))) {
      // jina.ai returns scraped HTML text for some sites
      try {
        const proxy = `https://r.jina.ai/http://${igUrl.replace(/^https?:\/\//,'')}`;
        const f2 = await fetchHtml(proxy);
        if (f2.ok && f2.text && f2.text.length > 50) {
          fetched = f2;
        }
      } catch (e) {
        // ignore
      }
    }

    const html = fetched.text || '';

    // try find metadata:
    // 1) og:video / og:image
    const videoMatch = html.match(/<meta[^>]+property=["']og:video["'][^>]*content=["']([^"']+)["']/i);
    const imageMatch = html.match(/<meta[^>]+property=["']og:image["'][^>]*content=["']([^"']+)["']/i);

    // 2) application/ld+json
    let ldJsonMatch = null;
    const ld = html.match(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/i);
    if (ld && ld[1]) {
      try { ldJsonMatch = JSON.parse(ld[1]); } catch (e) { /* ignore */ }
    }

    // 3) instagram embeds - window.__additionalDataLoaded etc (try to find "display_url" or "video_url")
    const displayUrl = html.match(/"display_url":"([^"]+)"/);
    const videoUrl = html.match(/"video_url":"([^"]+)"/) || html.match(/"playable_url":"([^"]+)"/);

    if (!videoMatch && !imageMatch && !ldJsonMatch && !displayUrl && !videoUrl) {
      return res.status(200).json({
        status: "NO_MEDIA",
        message: "Instagram returned non-JSON page or no media tags found.",
        snippet: html.slice(0, 2000),
        original_url: igUrl
      });
    }

    // construct result items array
    const results = [];

    // from ld+json if present
    if (ldJsonMatch) {
      // ldJson can be object or array
      const objs = Array.isArray(ldJsonMatch) ? ldJsonMatch : [ldJsonMatch];
      objs.forEach(o => {
        if (o && (o.contentUrl || o.thumbnailUrl || o.image)) {
          results.push({
            media: o.contentUrl || (typeof o.image === 'string' ? o.image : (Array.isArray(o.image) ? o.image[0] : null)),
            thumb: o.thumbnailUrl || (typeof o.image === 'string' ? o.image : (Array.isArray(o.image) ? o.image[0] : null)),
            isVideo: !!o.video || !!o.contentUrl
          });
        }
      });
    }

    // og tags
    if (videoMatch || imageMatch) {
      results.push({
        media: videoMatch ? videoMatch[1] : imageMatch ? imageMatch[1] : null,
        thumb: imageMatch ? imageMatch[1] : null,
        isVideo: !!videoMatch
      });
    }

    // fallback parse display_url / video_url
    if (displayUrl && !results.length) {
      results.push({
        media: decodeURIComponent(displayUrl[1]),
        thumb: decodeURIComponent(displayUrl[1]),
        isVideo: false
      });
    }
    if (videoUrl && !results.length) {
      results.push({
        media: decodeURIComponent((videoUrl[1]||'').replace(/\\u0026/g,'&')),
        thumb: null,
        isVideo: true
      });
    }

    if (!results.length) {
      return res.status(200).json({
        status: "NO_MEDIA",
        message: "Parsed JSON but no media found",
        snippet: html.slice(0, 2000),
        parsedKeys: []
      });
    }

    return res.status(200).json({ status: 200, data: results });

  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: true, detail: String(err) });
  }
}
