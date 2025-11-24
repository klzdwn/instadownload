// /api/extract.js
// Multi-upstream fallback proxy for IG downloader (snapinsta/snapsave/fastdl/instasave/...)
// Next.js / Vercel API route style (export default handler)

export default async function handler(req, res) {
  // Basic CORS (for dev; restrict in production)
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const { url } = req.body || {};
    if (!url) return res.status(400).json({ error: "Missing url in body" });

    // --- List of upstream endpoints to try (functions that accept original url) ---
    const endpoints = [
      u => `https://snapsave.app/action.php?url=${encodeURIComponent(u)}`,           // SnapSave
      u => `https://snapinsta.app/action.php?url=${encodeURIComponent(u)}`,          // SnapInsta
      u => `https://instasave.deno.dev/api?url=${encodeURIComponent(u)}`,           // instasave (deno)
      u => `https://saveinsta.app/dl?link=${encodeURIComponent(u)}`,                // SaveInsta (if available)
      u => `https://fastdl.app/en2?url=${encodeURIComponent(u)}`,                   // FastDL (example path—adjust if different)
      u => `https://instadownloader.co/ajax.php?url=${encodeURIComponent(u)}`,      // example mirror (may or may not work)
      // add more functions here if you find another working public endpoint
    ];

    // helper to fetch with UA
    async function simpleFetch(target) {
      const headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
        "Accept": "*/*",
      };
      const r = await fetch(target, { method: "GET", headers, redirect: "follow" });
      const text = await r.text();
      return { ok: r.ok, status: r.status, text, target };
    }

    let upstreamText = null;
    let upstreamStatus = null;
    let usedEndpoint = null;

    // Try endpoints sequentially until one returns non-empty body
    for (const fn of endpoints) {
      const target = fn(url);
      try {
        const { ok, status, text } = await simpleFetch(target);
        if (text && text.length > 100) { // heuristik: minimal content
          upstreamText = text;
          upstreamStatus = status;
          usedEndpoint = target;
          break;
        }
        // if text empty or too short, try next
      } catch (err) {
        // ignore and try next
        console.warn("upstream fetch error", target, err && err.message);
        continue;
      }
    }

    if (!upstreamText) {
      return res.status(502).json({
        error: true,
        detail: "No upstream returned usable content",
        tried: endpoints.map(f => f(url))
      });
    }

    // Attempt parse JSON first
    let parsed = null;
    try { parsed = JSON.parse(upstreamText); } catch (e) { parsed = null; }

    const items = [];

    const pushItem = (thumb, media, isVideo) => {
      if (!media) return;
      items.push({ thumb: thumb || null, media, isVideo: !!isVideo });
    };

    // If parsed JSON, try to normalize common shapes
    if (parsed && typeof parsed === "object") {
      // common array locations
      const candidateArrays = [];
      if (Array.isArray(parsed.data)) candidateArrays.push(parsed.data);
      if (Array.isArray(parsed.results)) candidateArrays.push(parsed.results);
      if (Array.isArray(parsed.items)) candidateArrays.push(parsed.items);
      if (parsed.data && Array.isArray(parsed.data.data)) candidateArrays.push(parsed.data.data);

      let found = false;
      for (const arr of candidateArrays) {
        if (arr && arr.length) {
          for (const it of arr) {
            const media = typeof it === "string" ? it : (it.media || it.url || it.video || it.src || null);
            const thumb = it.thumb || it.thumbnail || it.poster || it.preview || null;
            const isVideo = !!(it.isVideo || /mp4|video/i.test(String(media || "")));
            pushItem(thumb, media, isVideo);
          }
          found = true;
          break;
        }
      }

      if (!found) {
        // single-object cases
        const media = parsed.media || parsed.url || parsed.video || parsed.src || null;
        const thumb = parsed.thumb || parsed.thumbnail || parsed.preview || null;
        if (media) pushItem(thumb, media, /mp4|video/i.test(String(media)));
      }
    }

    // If no items yet, try regex over HTML
    if (items.length === 0) {
      // regex to pick mp4/jpg/png/jpeg/webp/m3u8 with optional querystring
      const mediaRegex = /https?:\/\/[^\s"'<>]+?\.(?:mp4|m3u8|mkv|jpg|jpeg|png|webp)(?:\?[^\s"'<>]*)?/gi;
      const matches = (upstreamText.match(mediaRegex) || []);
      const uniq = Array.from(new Set(matches));

      // Heuristic: if images only, set as thumb+media; if videos present, add them
      uniq.forEach(m => {
        const isVideo = /\.(mp4|m3u8|mkv)/i.test(m);
        pushItem(isVideo ? null : m, m, isVideo);
      });

      // Also try OG meta tags locally inside the upstreamText (some services return IG HTML)
      const ogImage = (upstreamText.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i) || [])[1];
      const ogVideo = (upstreamText.match(/<meta[^>]+property=["']og:video["'][^>]+content=["']([^"']+)["']/i) || [])[1]
                    || (upstreamText.match(/<meta[^>]+property=["']og:video:secure_url["'][^>]+content=["']([^"']+)["']/i) || [])[1];
      if ((ogVideo || ogImage) && items.length === 0) {
        if (ogVideo) pushItem(ogImage || null, ogVideo, true);
        else pushItem(ogImage, ogImage, false);
      }
    }

    // normalize and filter
    const final = items
      .map(it => ({ thumb: it.thumb || null, media: it.media || null, isVideo: !!it.isVideo }))
      .filter(it => it.media);

    if (final.length === 0) {
      return res.status(200).json({
        status: "NO_MEDIA",
        message: "Upstream responded but no media found. See snippet.",
        usedEndpoint,
        upstreamStatus,
        snippet: upstreamText.slice(0, 3000),
        original_url: url
      });
    }

    // success
    return res.status(200).json({ status: 200, usedEndpoint, data: final });

  } catch (err) {
    console.error("extract error:", err && err.stack || err);
    res.setHeader("Access-Control-Allow-Origin", "*");
    return res.status(500).json({ error: true, detail: String(err) });
  }
}
