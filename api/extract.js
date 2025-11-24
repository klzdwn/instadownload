// /api/extract.js
// Vercel serverless function — POST only
export default async function handler(req, res) {
  // CORS (ubah origin jika perlu)
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed, use POST" });
  }

  try {
    // --- robust body parsing ---
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
      } else {
        body = {};
      }
    }

    const url = (body && body.url) ? String(body.url).trim() : null;
    if (!url) {
      return res.status(400).json({ error: "Missing 'url' in request body" });
    }

    // --- env ---
    const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY;
    const RAPIDAPI_HOST = process.env.RAPIDAPI_HOST || "instagram-downloader-scraper-reels-igtv-posts-stories.p.rapidapi.com";

    if (!RAPIDAPI_KEY) {
      console.error("RAPIDAPI_KEY not set in environment");
      return res.status(500).json({ error: "Server not configured (missing RAPIDAPI_KEY)" });
    }

    // build target (provider's scraper endpoint)
    const endpoint = `https://${RAPIDAPI_HOST}/scraper?url=${encodeURIComponent(url)}`;

    // --- fetch with timeout ---
    const controller = new AbortController();
    const timeoutMs = 15000; // 15s
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    let upstream;
    try {
      upstream = await fetch(endpoint, {
        method: "GET",
        headers: {
          "x-rapidapi-host": RAPIDAPI_HOST,
          "x-rapidapi-key": RAPIDAPI_KEY,
          "Accept": "application/json"
        },
        signal: controller.signal
      });
    } catch (fetchErr) {
      clearTimeout(timeout);
      console.error("Fetch to RapidAPI failed:", fetchErr && fetchErr.message ? fetchErr.message : fetchErr);
      if (fetchErr && fetchErr.name === "AbortError") {
        return res.status(504).json({ error: "Upstream timeout" });
      }
      return res.status(502).json({ error: "Failed to reach upstream provider", detail: String(fetchErr) });
    }
    clearTimeout(timeout);

    const raw = await upstream.text().catch((e) => {
      console.error("Failed reading upstream text:", e);
      return "";
    });

    // try parse JSON
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (parseErr) {
      // upstream didn't return JSON (likely HTML/login/challenge) -> give snippet for debug
      const snippet = (typeof raw === "string" && raw.length) ? raw.slice(0, 4000) : "";
      console.error("Upstream returned non-JSON response. status:", upstream.status);
      return res.status(502).json({
        error: "Upstream returned non-JSON response",
        status: upstream.status,
        snippet
      });
    }

    // --- attempt to enrich response with oEmbed thumbnail (server-side) ---
    // Purpose: if provider result has no thumbnail for items, try Instagram oEmbed for the original post
    try {
      // find possible items array inside parsed
      let items = null;
      if (Array.isArray(parsed)) items = parsed;
      else if (parsed && Array.isArray(parsed.data)) items = parsed.data;
      else if (parsed && Array.isArray(parsed.items)) items = parsed.items;
      else if (parsed && parsed.data && parsed.data.data && Array.isArray(parsed.data.data)) items = parsed.data.data;

      // if items exist and at least one lacks a thumbnail, try oEmbed
      const needThumb = items && items.some(it => !(it.thumb || it.thumbnail || it.preview || it.poster));
      if (items && items.length && needThumb) {
        // Try Instagram oEmbed (server-side) - returns thumbnail_url for public posts
        try {
          const oembedRes = await fetch(`https://api.instagram.com/oembed/?url=${encodeURIComponent(url)}`, { method: "GET" });
          if (oembedRes && oembedRes.ok) {
            const odata = await oembedRes.json();
            const thumbUrl = odata && (odata.thumbnail_url || odata.thumbnail_url_with_play_button || odata.thumbnail);
            if (thumbUrl) {
              // attach to every item that is missing thumb (best-effort)
              items.forEach(it => {
                if (!(it.thumb || it.thumbnail || it.preview || it.poster)) {
                  // set a common key 'thumb' used by frontend
                  it.thumb = thumbUrl;
                }
              });
              // if parsed.data.data exists, we already mutated 'items' in place
            }
          } else {
            // non-ok oembed; ignore silently (some posts may not be reachable)
          }
        } catch (oe) {
          // ignore oembed errors
          console.warn("oEmbed fetch failed:", oe && oe.message ? oe.message : oe);
        }
      }
    } catch (enrichErr) {
      // don't fail entire request if enrichment fails
      console.warn("Thumbnail enrichment failed:", enrichErr && enrichErr.message ? enrichErr.message : enrichErr);
    }

    // finally forward parsed result (with possible augmentation)
    return res.status(200).json({ status: upstream.status, data: parsed });

  } catch (err) {
    // top-level catch (shouldn't happen often)
    console.error("extract handler fatal error:", err && err.stack ? err.stack : err);
    return res.status(500).json({ error: "Internal server error", code: "FUNCTION_INVOCATION_FAILED" });
  }
}
