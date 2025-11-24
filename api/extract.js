// /api/extract.js
// Robust extractor: try public API then fallback to scraping HTML
export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Use POST" });

  try {
    const { url } = req.body || {};
    if (!url) return res.status(400).json({ error: "Missing url" });

    const debug = { tried: [] };

    // helper to try upstream JSON API
    async function tryInstasave(u) {
      const api = `https://instasave.deno.dev/api?url=${encodeURIComponent(u)}`;
      debug.tried.push({ name: "instasave", url: api });
      const r = await fetch(api, { headers: { "User-Agent": "Mozilla/5.0" } });
      const txt = await r.text();
      try {
        const j = JSON.parse(txt);
        // expected shape: { media: [...] } or similar
        if (j && (j.media || j.items || j.data)) return { src: "instasave", json: j, raw: txt };
      } catch (e) {
        // not json
        return null;
      }
      return null;
    }

    // helper to fetch IG page HTML and attempt parse
    async function tryInstagramHtml(u) {
      debug.tried.push({ name: "instagram_html", url: u });
      const r = await fetch(u, { headers: { "User-Agent": "Mozilla/5.0" } });
      const html = await r.text();

      // attempt: application/ld+json
      const ldMatch = html.match(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/i);
      if (ldMatch) {
        try {
          const ld = JSON.parse(ldMatch[1]);
          // ld may contain image or video
          const items = [];
          if (ld && ld.image) {
            if (Array.isArray(ld.image)) {
              ld.image.forEach(i => items.push({ media: i, thumb: i, isVideo: false }));
            } else {
              items.push({ media: ld.image, thumb: ld.image, isVideo: false });
            }
          }
          if (ld && ld.video && ld.video.contentUrl) {
            items.push({ media: ld.video.contentUrl, thumb: ld.thumbnailUrl || null, isVideo: true });
          }
          if (items.length) return { src: "ld_json", items, raw: html.slice(0,1000) };
        } catch (e) { /* ignore parse error */ }
      }

      // attempt: window._sharedData or script containing "graphql"
      const sharedMatch = html.match(/window\._sharedData\s*=\s*({[\s\S]*?});<\/script>/);
      if (sharedMatch) {
        try {
          const shared = JSON.parse(sharedMatch[1]);
          // find first media node
          const items = [];
          // several different shapes, try common path
          const entry = (shared.entry_data && (shared.entry_data.PostPage || shared.entry_data.VideoPage || shared.entry_data.ProfilePage)) || null;
          if (entry) {
            const post = entry[0] && (entry[0].graphql || entry[0].[0] || entry[0]);
            // flexible deep search
            function findMedia(node) {
              if (!node || typeof node !== "object") return;
              if (node.display_url) {
                items.push({ media: node.video_url || node.display_url, thumb: node.display_url, isVideo: !!node.is_video });
                return;
              }
              if (node.edge_sidecar_to_children && node.edge_sidecar_to_children.edges) {
                node.edge_sidecar_to_children.edges.forEach(e => findMedia(e.node));
                return;
              }
              // search keys
              for (const k of Object.keys(node)) {
                findMedia(node[k]);
              }
            }
            findMedia(shared);
          }
          if (items.length) return { src: "sharedData", items, raw: html.slice(0,1000) };
        } catch (e) { /* parse fail */ }
      }

      // fallback: meta tags og:video / og:image
      const metaVideo = html.match(/<meta\s+property=["']og:video["']\s+content=["']([^"']+)["']/i);
      const metaImage = html.match(/<meta\s+property=["']og:image["']\s+content=["']([^"']+)["']/i);
      const items = [];
      if (metaVideo) items.push({ media: metaVideo[1], thumb: metaImage ? metaImage[1] : null, isVideo: true });
      else if (metaImage) items.push({ media: metaImage[1], thumb: metaImage[1], isVideo: false });

      if (items.length) return { src: "meta_og", items, raw: html.slice(0,1000) };
      return { src: "html_none", raw: html.slice(0,1000) };
    }

    // 1) try public instasave
    let upstreamResult = null;
    try {
      upstreamResult = await tryInstasave(url);
    } catch (err) {
      debug.instasave_error = String(err);
    }

    // 2) if instasave failed, try direct HTML parse
    if (!upstreamResult) {
      try {
        const parsed = await tryInstagramHtml(url);
        if (parsed && parsed.items && parsed.items.length) {
          const items = parsed.items.map(i => ({
            media: i.media,
            thumb: i.thumb || null,
            isVideo: !!i.isVideo
          }));
          return res.status(200).json({ status: 200, data: items, debug });
        } else {
          // no media found from html, return snippet for debugging
          return res.status(200).json({ status: "NO_MEDIA", debug, snippet: parsed && parsed.raw ? parsed.raw : null });
        }
      } catch (err) {
        return res.status(500).json({ error: String(err), debug });
      }
    }

    // if instasave returned JSON -> normalize
    const j = upstreamResult.json;
    // different shapes: j.media, j.items, j.data
    const arr = j.media || j.items || j.data || null;
    if (!arr || !Array.isArray(arr) || arr.length === 0) {
      // maybe instasave returned object with one media
      // try to extract urls by scanning keys
      const items = [];
      function scanObj(o) {
        if (!o || typeof o !== "object") return;
        if (o.url && (o.type || o.mime_type)) {
          items.push({ media: o.url, thumb: o.thumbnail || o.thumb || null, isVideo: (o.type && o.type.includes("video")) || !!o.is_video });
        }
        for (const k of Object.keys(o)) {
          const v = o[k];
          if (typeof v === "string" && (v.endsWith(".mp4") || v.match(/\.(jpg|jpeg|png)/))) {
            // guess
            items.push({ media: v, thumb: v, isVideo: v.endsWith(".mp4") });
          } else if (typeof v === "object") scanObj(v);
        }
      }
      scanObj(j);
      if (items.length) {
        return res.status(200).json({ status: 200, data: items, debug });
      } else {
        return res.status(200).json({ status: "NO_MEDIA_JSON", debug, upstream: upstreamResult.raw });
      }
    }

    // normalize arr
    const items = arr.map(it => {
      if (typeof it === "string") return { media: it, thumb: null, isVideo: /\.mp4/i.test(it) };
      return {
        media: it.url || it.media || it.src || it.video || it.file || null,
        thumb: it.thumbnail || it.thumb || it.preview || null,
        isVideo: !!(it.type && it.type.includes("video")) || !!it.is_video || /\.mp4/i.test(it.url || it.media || "")
      };
    }).filter(x => x.media);

    if (!items.length) {
      return res.status(200).json({ status: "NO_MEDIA_PARSED", debug, upstream: upstreamResult.raw });
    }

    return res.status(200).json({ status: 200, data: items, debug });

  } catch (err) {
    return res.status(500).json({ error: String(err) });
  }
}
