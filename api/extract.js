// /api/extract.js
// Vercel serverless function: robust extractor with fallbacks
export default async function handler(req, res) {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed, use POST" });

  try {
    // parse body robustly
    let body = req.body;
    if (!body || (typeof body === "object" && Object.keys(body).length === 0)) {
      if (req.on) {
        body = await new Promise((resolve) => {
          let raw = "";
          req.on("data", (c) => (raw += c));
          req.on("end", () => {
            try { resolve(JSON.parse(raw || "{}")); }
            catch { resolve({}); }
          });
        });
      } else body = {};
    }

    const url = body && body.url ? String(body.url).trim() : null;
    if (!url) return res.status(400).json({ error: "Missing 'url' in request body" });

    // helper to fetch with headers and timeout
    const doFetch = async (u, opts = {}) => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);
      try {
        const r = await fetch(u, { signal: controller.signal, ...opts });
        clearTimeout(timeout);
        return r;
      } catch (e) {
        clearTimeout(timeout);
        throw e;
      }
    };

    // 1) Try oembed (gives thumbnail + type quickly if available)
    try {
      const oe = await doFetch(`https://www.instagram.com/oembed/?url=${encodeURIComponent(url)}`, {
        headers: { "User-Agent": "Mozilla/5.0", Accept: "application/json" }
      });
      if (oe.ok) {
        try {
          const j = await oe.json();
          // keep but continue to more detailed fetch below for media urls
          // store oembed if needed
        } catch (e) {
          // ignore
        }
      }
    } catch (e) {
      // ignore oembed errors; continue
    }

    // extract shortcode (supports /p/, /reel/, /tv/ and trailing params)
    const m = url.match(/\/(p|reel|tv|reels)\/([A-Za-z0-9_\-]+)/i);
    let shortcode = m && m[2] ? m[2] : null;

    // if not found, try to parse from URL param or last path segment
    if (!shortcode) {
      try {
        const uobj = new URL(url);
        const parts = (uobj.pathname || "").split("/").filter(Boolean);
        shortcode = parts.length ? parts[parts.length - 1] : null;
      } catch (e) { /* ignore */ }
    }

    if (!shortcode) {
      // fallback: if user provided full ig url but we can't parse
      return res.status(400).json({ error: "Cannot extract shortcode from provided URL" });
    }

    // 2) Try direct Instagram JSON endpoint with realistic headers
    const igUrlCandidates = [
      `https://www.instagram.com/p/${shortcode}/?__a=1&__d=dis`,
      `https://www.instagram.com/reel/${shortcode}/?__a=1&__d=dis`,
      `https://www.instagram.com/tv/${shortcode}/?__a=1&__d=dis`
    ];

    // browser-like headers
    const baseHeaders = {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
      "Accept": "application/json, text/plain, */*",
      "Referer": "https://www.instagram.com/",
      // lightweight dummy cookies to reduce bot-challenge in some cases
      "Cookie": "ig_did=xxxx; csrftoken=xxxx; mid=xxxx;",
      "sec-ch-ua": '"Chromium";v="121", "Google Chrome";v="121"',
      "sec-ch-ua-mobile": "?0",
      "sec-ch-ua-platform": '"Windows"'
    };

    let igJson = null;
    let lastHtmlSnippet = null;

    for (const candidate of igUrlCandidates) {
      try {
        const r = await doFetch(candidate, { headers: baseHeaders });
        const txt = await r.text();

        // if starts with '<' -> HTML returned (blocked or login page)
        if (txt && txt.trim().startsWith("<")) {
          lastHtmlSnippet = txt.slice(0, 1000);
          // try next candidate
          continue;
        }

        // try parse JSON
        try {
          const parsed = JSON.parse(txt);
          igJson = parsed;
          break;
        } catch (e) {
          lastHtmlSnippet = txt.slice(0, 1000);
          continue;
        }
      } catch (fetchErr) {
        // network / timeout: continue to next
        lastHtmlSnippet = String(fetchErr).slice(0, 1000);
        continue;
      }
    }

    // 3) If direct IG failed, try RapidAPI provider if env present
    if (!igJson) {
      const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY;
      const RAPIDAPI_HOST = process.env.RAPIDAPI_HOST || "instagram-downloader-scraper-reels-igtv-posts-stories.p.rapidapi.com";
      if (RAPIDAPI_KEY) {
        try {
          const endpoint = `https://${RAPIDAPI_HOST}/scraper?url=${encodeURIComponent(url)}`;
          const ru = await doFetch(endpoint, {
            headers: {
              "x-rapidapi-host": RAPIDAPI_HOST,
              "x-rapidapi-key": RAPIDAPI_KEY,
              "Accept": "application/json"
            }
          });
          const txt = await ru.text();
          try {
            const parsed = JSON.parse(txt);
            // if provider wraps result under data/data, normalize later
            igJson = parsed;
          } catch (e) {
            lastHtmlSnippet = txt.slice(0, 2000);
          }
        } catch (e) {
          lastHtmlSnippet = String(e).slice(0, 1000);
        }
      }
    }

    // if still no JSON -> return helpful error + snippet
    if (!igJson) {
  return res.status(200).json({
    status: "NO_JSON",
    html: lastHtmlSnippet || "(empty)",
    message: "Instagram returned non-JSON page."
  });
}

    // --- normalize/parse igJson to array of media items ---
    // Many shapes possible depending on source; handle common ones.
    const output = [];

    // Case: RapidAPI provider returns { data: { data: [ ... ] } } or similar
    const probeArray = (x) => {
      if (!x) return null;
      if (Array.isArray(x)) return x;
      if (x.data && Array.isArray(x.data)) return x.data;
      if (x.items && Array.isArray(x.items)) return x.items;
      return null;
    };

    let items = probeArray(igJson) || probeArray(igJson?.data) || null;

    // If igJson has graphql.shortcode_media (classic)
    if (!items && igJson.graphql && igJson.graphql.shortcode_media) {
      const m = igJson.graphql.shortcode_media;
      // carousel:
      if (m.edge_sidecar_to_children && Array.isArray(m.edge_sidecar_to_children.edges)) {
        items = m.edge_sidecar_to_children.edges.map(e => e.node);
      } else {
        items = [m];
      }
    }

    // Another shape: parsed from older endpoints
    if (!items && igJson.items && Array.isArray(igJson.items)) items = igJson.items;

    // If items still null and igJson seems like one media, wrap it
    if (!items) {
      // try to convert possible single object into array
      if (typeof igJson === "object") items = [igJson];
    }

    if (!items || !items.length) {
      return res.status(200).json({ status: 200, data: [] });
    }

    // map common fields
    for (const node of items) {
      try {
        // many possible shapes: check fields safely
        // prefer thumb url fields commonly used
        const thumb =
          node.thumbnail_src ||
          node.thumbnail_url ||
          node.display_url ||
          node.display_resources?.[0]?.src ||
          node.image_versions2?.candidates?.[0]?.url ||
          node.thumb ||
          node.poster ||
          node.poster_url ||
          null;

        // media url (video or image)
        let media = "";
        if (node.is_video || node.media_type === 2 || node.video_url || node.video_versions) {
          media =
            node.video_url ||
            (node.video_versions && node.video_versions[0] && node.video_versions[0].url) ||
            node.media || "";
        } else {
          media =
            node.display_url ||
            node.image_versions2?.candidates?.[0]?.url ||
            node.media ||
            node.url ||
            "";
        }

        const isVideo = !!(node.is_video || /\.mp4|video/.test(String(media)));

        output.push({ thumb: thumb || null, media: media || null, isVideo });
      } catch (e) {
        // skip node on parsing error
      }
    }

    return res.status(200).json({ status: 200, data: output });
  } catch (err) {
    console.error("extract handler error:", err && err.stack ? err.stack : err);
    return res.status(500).json({ error: "Server error", detail: String(err) });
  }
}
