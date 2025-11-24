// api/extract.js
// Improved Vercel serverless handler with better error logging and safe responses.

export default async function handler(req, res) {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed, use POST" });

  try {
    // robust body parsing for different runtimes
    let body = req.body;
    if (!body || (typeof body === "object" && Object.keys(body).length === 0)) {
      // try to read raw stream (some runtimes)
      if (req.on) {
        body = await new Promise((resolve) => {
          let d = "";
          req.on("data", (c) => (d += c));
          req.on("end", () => {
            try { resolve(JSON.parse(d || "{}")); }
            catch (e) { resolve({}); }
          });
        });
      } else {
        body = {};
      }
    }

    const { url } = body || {};
    if (!url || typeof url !== "string") {
      return res.status(400).json({ error: "Missing 'url' in request body" });
    }

    const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY;
    const RAPIDAPI_HOST = process.env.RAPIDAPI_HOST || "instagram-downloader-scraper-reels-igtv-posts-stories.p.rapidapi.com";

    if (!RAPIDAPI_KEY) {
      console.error("Missing RAPIDAPI_KEY env var");
      return res.status(500).json({ error: "RapidAPI key not configured (RAPIDAPI_KEY)" });
    }

    const endpoint = `https://${RAPIDAPI_HOST}/scraper?url=${encodeURIComponent(url)}`;

    // timeout
    const controller = new AbortController();
    const timeoutMs = 15000;
    const t = setTimeout(() => controller.abort(), timeoutMs);

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
    } catch (fetchErr) {
      clearTimeout(t);
      console.error("Fetch to RapidAPI failed:", fetchErr && fetchErr.message ? fetchErr.message : fetchErr);
      if (fetchErr.name === "AbortError") {
        return res.status(504).json({ error: "Upstream timeout" });
      }
      return res.status(502).json({ error: "Failed to reach RapidAPI", detail: String(fetchErr.message || fetchErr) });
    }
    clearTimeout(t);

    const text = await rapidRes.text().catch(err => {
      console.error("Failed reading upstream text:", err);
      return "";
    });

    // try parse JSON
    try {
      const data = JSON.parse(text);
      return res.status(200).json({ status: rapidRes.status, data });
    } catch (parseErr) {
      // upstream returned HTML or other non-JSON -> include short snippet for debugging
      const snippet = text ? text.slice(0, 4000) : "";
      console.error("Upstream returned non-JSON; status:", rapidRes.status);
      // Don't leak keys or secrets in response
      return res.status(502).json({
        error: "Upstream returned non-JSON response",
        status: rapidRes.status,
        // include snippet to debug (short)
        snippet
      });
    }

  } catch (err) {
    // Log stacktrace for debugging in Vercel logs
    console.error("extract handler top-level error:", err && err.stack ? err.stack : err);
    // Return a sanitized error message to client
    return res.status(500).json({ error: "A server error has occurred", code: "FUNCTION_INVOCATION_FAILED" });
  }
}
