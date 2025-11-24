// /api/extract.js
// Vercel serverless: POST { url } -> JSON { data: [ { thumb, media, isVideo }, ... ] }
// No RapidAPI required — this scrapes public Instagram page HTML and extracts JSON.

export default async function handler(req, res) {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed, use POST" });

  try {
    const body = typeof req.body === "object" ? req.body : JSON.parse(req.body || "{}");
    const url = body && body.url ? String(body.url).trim() : "";
    if (!url) return res.status(400).json({ error: "Missing 'url' in request body" });

    // Normalize (ensure http(s) present)
    let target = url;
    if (!/^https?:\/\//i.test(target)) target = "https://" + target.replace(/^\/+/, "");

    // fetch Instagram page with UA to reduce bot blocks
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    const resp = await fetch(target, {
      method: "GET",
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
                      "(KHTML, like Gecko) Chrome/120.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml",
        "Accept-Language": "en-US,en;q=0.9"
      },
      signal: controller.signal
    }).catch(err => {
      clearTimeout(timeout);
      throw err;
    });

    clearTimeout(timeout);

    if (!resp || !resp.ok) {
      return res.status(502).json({ error: "Failed fetching Instagram page", status: resp ? resp.status : "no-resp" });
    }

    const text = await resp.text();

    // try to extract JSON from <script id="__NEXT_DATA__"> ... </script>
    const nextDataMatch = text.match(/<script[^>]*id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i);
    let jsonObj = null;
    if (nextDataMatch && nextDataMatch[1]) {
      try {
        jsonObj = JSON.parse(nextDataMatch[1]);
      } catch (e) {
        // continue
      }
    }

    // fallback: window._sharedData = {...};
    if (!jsonObj) {
      const sharedMatch = text.match(/window\._sharedData\s*=\s*({[\s\S]*?});\s*<\/script>/i);
      if (sharedMatch && sharedMatch[1]) {
        try {
          jsonObj = JSON.parse(sharedMatch[1]);
        } catch (e) {
          // ignore
        }
      }
    }

    // fallback: look for any large JSON script tag (application/ld+json)
    if (!jsonObj) {
      const ldMatch = text.match(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/i);
      if (ldMatch && ldMatch[1]) {
        try {
          const ld = JSON.parse(ldMatch[1]);
          // wrap in minimal structure
          jsonObj = { ld };
        } catch (e) {}
      }
    }

    if (!jsonObj) {
      // give snippet for debug
      return res.status(502).json({
        error: "Failed to extract JSON from page (Instagram layout may have changed or blocked).",
        snippet: text.slice(0, 3000)
      });
    }

    // try to find media objects in common locations
    // common path: jsonObj.props.pageProps?.graphql?.shortcode_media
    function safeGet(obj, pathArr) {
      try {
        return pathArr.reduce((a, k) => (a && a[k] !== undefined ? a[k] : null), obj);
      } catch { return null; }
    }

    let mediaRoots = [];

    // Next.js app structure
    const cand1 = safeGet(jsonObj, ["props","pageProps","graphql","shortcode_media"]);
    if (cand1) mediaRoots.push(cand1);

    // older sharedData
    const cand2 = safeGet(jsonObj, ["entry_data","PostPage"]);
    if (cand2 && Array.isArray(cand2) && cand2[0] && cand2[0].graphql && cand2[0].graphql.shortcode_media) {
      mediaRoots.push(cand2[0].graphql.shortcode_media);
    }

    // sometimes in jsonObj.ld (from ld+json) there's media info
    const candLd = safeGet(jsonObj, ["ld"]);
    if (candLd) {
      // push as a single item-like
      mediaRoots.push(candLd);
    }

    // if none found, try to search for a "shortcode_media" anywhere
    if (!mediaRoots.length) {
      const s = JSON.stringify(jsonObj);
      const scMatch = s.match(/"shortcode_media":\s*({[\s\S]*?"is_video":)/);
      if (scMatch) {
        try {
          // try find the object via regex - risky but attempt
          const idx = s.indexOf('"shortcode_media":');
          const rest = s.slice(idx + 17);
          // naive bracket matching to extract object:
          let depth = 0, end = -1;
          for (let i=0;i<rest.length;i++){
            if (rest[i]==='{') depth++;
            else if (rest[i]==='}') {
              depth--;
              if (depth===0) { end = i; break; }
            }
          }
          if (end > 0) {
            const obj = JSON.parse(rest.slice(0, end+1));
            mediaRoots.push(obj);
          }
        } catch(e){}
      }
    }

    if (!mediaRoots.length) {
      return res.status(200).json({ status: 200, data: [] }); // no media found but OK
    }

    // normalize to items array
    const items = [];

    const pushFromRoot = (root) => {
      if (!root) return;
      // if carousel
      if (root.edge_sidecar_to_children && root.edge_sidecar_to_children.edges) {
        const edges = root.edge_sidecar_to_children.edges;
        edges.forEach(edge => {
          const n = edge.node || edge;
          const thumb = n.display_resources && n.display_resources.length ? n.display_resources[0].src
                      : n.thumbnail_src || n.thumbnail_url || n.display_url || n.owner && n.owner.profile_pic_url || null;
          const media = n.video_url || n.display_url || n.display_url || (n.edge_media_to_caption && n.edge_media_to_caption.edges && n.edge_media_to_caption.edges[0] && n.edge_media_to_caption.edges[0].node && n.edge_media_to_caption.edges[0].node.text) || "";
          items.push({
            thumb,
            media: n.is_video ? n.video_url || n.display_url : (n.display_url || n.thumbnail_src || ""),
            isVideo: !!n.is_video
          });
        });
        return;
      }

      // single media
      const thumb = root.display_resources && root.display_resources.length ? root.display_resources[0].src
                  : root.thumbnail_src || root.thumbnail_url || root.display_url || null;

      const media = root.video_url || root.video_play_url || root.display_url || root.url || null;
      const isVideo = !!(root.is_video || root.media_type === 2 || /mp4|video/.test(String(media || "")));

      items.push({ thumb, media, isVideo });
    };

    mediaRoots.forEach(r => pushFromRoot(r));

    // final filtering: ensure urls are strings and unique
    const out = items
      .map(i => ({
        thumb: i.thumb ? String(i.thumb) : null,
        media: i.media ? String(i.media) : null,
        isVideo: !!i.isVideo
      }))
      .filter(i => i.media || i.thumb)
      .filter((v,i,arr) => arr.findIndex(x => x.media === v.media && x.thumb === v.thumb) === i);

    return res.status(200).json({ status: 200, data: out });

  } catch (err) {
    console.error("extract error:", err && err.stack ? err.stack : err);
    return res.status(500).json({ error: "Internal server error", detail: String(err) });
  }
}
