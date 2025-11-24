// api/extract.js
// Node / Vercel Serverless handler
export default async function handler(req, res) {
  // CORS - sesuaikan origin jika mau batasi
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed, use POST" });
  }

  try {
    // parse JSON body safely
    let body = req.body;
    if (!body || Object.keys(body).length === 0) {
      // some runtimes provide raw stream; try parse
      body = await new Promise((resolve) => {
        let d = "";
        req.on && req.on("data", (c) => (d += c));
        req.on && req.on("end", () => {
          try {
            resolve(JSON.parse(d || "{}"));
          } catch (e) {
            resolve({});
          }
        });
      });
    }

    const { url } = body || {};
    if (!url || typeof url !== "string") {
      return res.status(400).json({ error: "Missing 'url' in request body" });
    }

    const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY;
    const RAPIDAPI_HOST = process.env.RAPIDAPI_HOST || "instagram-downloader-scraper-reels-igtv-posts-stories.p.rapidapi.com";

    if (!RAPIDAPI_KEY) {
      return res.status(500).json({ error: "RapidAPI key not configured (RAPIDAPI_KEY)" });
    }

    // build rapidapi endpoint (per provider docs)
    const endpoint = `https://${RAPIDAPI_HOST}/scraper?url=${encodeURIComponent(url)}`;

    // timeout helper
    const controller = new AbortController();
    const timeoutMs = 15000; // 15s
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    let rapidRes;
    try {
      rapidRes = await fetch(endpoint, {
        method: "GET",
        headers: {
          "x-rapidapi-host": RAPIDAPI_HOST,
          "x-rapidapi-key": RAPIDAPI_KEY,
          "Accept": "application/json"
        },
        signal: controller.signal
      });
    } catch (err) {
      clearTimeout(timeout);
      if (err.name === "AbortError") {
        return res.status(504).json({ error: "Upstream timeout" });
      }
      console.error("fetch error:", err.message);
      return res.status(502).json({ error: "Failed to reach RapidAPI", detail: err.message });
    }
    clearTimeout(timeout);

    const text = await rapidRes.text();

    // try parse JSON; if upstream sent HTML/login page, return snippet for debug
    try {
      const data = JSON.parse(text);
      // forward upstream status and data
      return res.status(200).json({ status: rapidRes.status, data });
    } catch (err) {
      // upstream non-JSON: likely HTML (login/challenge) or error page
      // don't leak keys; include short snippet for debugging
      const snippet = text ? text.slice(0, 2000) : "";
      return res.status(502).json({
        error: "Upstream returned non-JSON response",
        status: rapidRes.status,
        snippet
      });
    }
  } catch (err) {
    console.error("extract handler error:", err);
    return res.status(500).json({ error: "Internal server error", detail: err.message });
  }
}
