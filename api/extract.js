// pages/api/extract.js
// Next.js serverless handler: try RapidAPI if key present, else fallback to HTML scraping
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { url } = req.body || {};
  if (!url) return res.status(400).json({ error: "Missing url" });

  // helper: normalize url (add https if missing)
  const normalize = (u) => {
    try { return new URL(u).toString(); }
    catch (e) { return u.startsWith("http") ? u : `https://${u}`; }
  };

  const target = normalize(url);

  // 1) Try RapidAPI if key set
  if (process.env.RAPID_KEY) {
    try {
      const rapidResp = await fetch(
        // adjust path if your RapidAPI provider differs
        `https://instagram-media-downloader.p.rapidapi.com/rapid/download?url=${encodeURIComponent(target)}`,
        {
          method: "GET",
          headers: {
            "X-RapidAPI-Key": process.env.RAPID_KEY,
            "X-RapidAPI-Host": "instagram-media-downloader.p.rapidapi.com"
          },
        }
      );
      const rapidJson = await rapidResp.json();

      // convert to our standard shape when possible
      if (rapidJson && Array.isArray(rapidJson.media) && rapidJson.media.length) {
        const data = rapidJson.media.map(m => ({
          thumb: m.thumbnail || null,
          media: m.url || null,
          isVideo: (m.type === "video") || Boolean(m.url && /\.mp4/i.test(m.url))
        }));
        return res.status(200).json({ status: 200, data });
      }

      // if RapidAPI returned but no media, continue to fallback
    } catch (err) {
      // ignore rapidapi errors, fall back to HTML scraping
      console.error("RapidAPI error:", err.message);
    }
  }

  // 2) Fallback: fetch page HTML and try extract JSON blobs
  try {
    // Use an Instagram-friendly UA
    const ua = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0 Safari/537.36";
    const pageResp = await fetch(target, { headers: { "User-Agent": ua, "Accept-Language": "en-US,en;q=0.9" } });
    const txt = await pageResp.text();

    // heuristics: try several script patterns
    const attempts = [];

    // 1) window._sharedData = {...};
    attempts.push((() => {
      const m = txt.match(/window\._sharedData\s*=\s*({.+?});\s*<\/script>/s);
      return m ? m[1] : null;
    })());

    // 2) application/ld+json
    attempts.push((() => {
      const m = txt.match(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/i);
      return m ? m[1] : null;
    })());

    // 3) window.__additionalDataLoaded\('feed', {...}\)
    attempts.push((() => {
      const m = txt.match(/window\.__additionalDataLoaded\([^,]+,\s*({.+?})\s*\);/s);
      return m ? m[1] : null;
    })());

    // 4) "sharedData" within some JSON blob (catch-all)
    attempts.push((() => {
      const m = txt.match(/<script[^>]*>\s*({\s*"config"[\s\S]*?)<\/script>/i);
      return m ? m[1] : null;
    })());

    // try each parsed JSON
    let parsed = null;
    for (const cand of attempts) {
      if (!cand) continue;
      try {
        const p = JSON.parse(cand);
        parsed = p;
        break;
      } catch (e) {
        // ignore parse errors
      }
    }

    // if still null, try to find JSON with "entry_data" or "graphql"
    if (!parsed) {
      const m2 = txt.match(/<script[^>]*>window\.__initialDataLoaded\([^,]+,\s*({.+?})\s*\)\s*<\/script>/s)
        || txt.match(/<script[^>]*>window\.__initialProps\s*=\s*({.+?})\s*<\/script>/s);
      if (m2 && m2[1]) {
        try { parsed = JSON.parse(m2[1]); } catch (e) {}
      }
    }

    // if STILL no parsed JSON, return debug
    if (!parsed) {
      return res.status(200).json({
        status: "NO_JSON_DEBUG",
        message: "Instagram returned non-JSON page.",
        snippet: txt.slice(0, 6000),
        original_url: target
      });
    }

    // Now try to find media inside parsed object (many shapes)
    const results = [];

    // helper to push if valid
    const tryPush = (thumb, media, isVideo=false) => {
      if (!thumb && !media) return;
      results.push({ thumb: thumb || null, media: media || null, isVideo: !!isVideo });
    };

    // common locations (legacy)
    try {
      // graphql shortcode_media (single)
      const sc = parsed.entry_data?.PostPage?.[0] || parsed?.entry_data?.ProfilePage?.[0] || parsed;
      if (sc && sc.graphql && sc.graphql.shortcode_media) {
        const node = sc.graphql.shortcode_media;
        if (node.__typename === "GraphVideo") {
          tryPush(node.display_url || node.thumbnail_src || node.thumbnail_resources?.[0]?.src, node.video_url || node.url, true);
        } else if (node.edge_sidecar_to_children && node.edge_sidecar_to_children.edges) {
          node.edge_sidecar_to_children.edges.forEach(e => {
            const n = e.node;
            tryPush(n.display_url || n.thumbnail_src, n.is_video ? n.video_url : (n.display_url || null), !!n.is_video);
          });
        } else {
          tryPush(node.display_url || node.thumbnail_src, node.is_video ? node.video_url : node.display_url, !!node.is_video);
        }
      }
    } catch(e){}

    // application/ld+json might contain image and video
    try {
      if (parsed["@type"] === "ImageObject" || parsed.image) {
        const im = parsed.image;
        if (typeof im === "string") tryPush(im, im, false);
        else if (Array.isArray(im)) tryPush(im[0], im[0], false);
      }
    } catch(e){}

    // other possible nested keys - search for "thumbnail_url" or "display_url" anywhere
    function deepSearch(obj) {
      if (!obj || typeof obj !== "object") return;
      if (obj.thumbnail_url || obj.thumbnail || obj.thumbnail_src || obj.display_url) {
        const thumb = obj.thumbnail_url || obj.thumbnail || obj.thumbnail_src || obj.display_url || null;
        const media = obj.video_url || obj.contentUrl || obj.url || null;
        const isVideo = Boolean(obj.is_video || (media && /\.mp4/i.test(media)));
        tryPush(thumb, media || thumb, isVideo);
      }
      for (const k of Object.keys(obj)) {
        try { deepSearch(obj[k]); } catch(e){}
      }
    }
    deepSearch(parsed);

    // dedupe results and normalize
    const uniq = [];
    const seen = new Set();
    for (const r of results) {
      const key = (r.media || r.thumb || "") + "|" + (r.isVideo ? "v":"i");
      if (!seen.has(key)) { seen.add(key); uniq.push(r); }
    }

    if (!uniq.length) {
      return res.status(200).json({
        status: 200,
        warning: "Parsed JSON but no media found. See parsed object keys for debug.",
        parsedKeys: Object.keys(parsed || {}),
        data: []
      });
    }

    return res.status(200).json({ status: 200, data: uniq });

  } catch (err) {
    console.error("Extract error:", err);
    return res.status(500).json({ error: "Server error", detail: err.message });
  }
}
