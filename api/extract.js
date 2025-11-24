// api/extract.js
export default async function handler(req, res) {
  // Allow CORS for your frontend (adjust origin if perlu)
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
    const body = req.body || (await new Promise(r => {
      let d = "";
      req.on("data", c => (d += c));
      req.on("end", () => r(JSON.parse(d || "{}")));
    }));

    const { url } = body;
    if (!url || typeof url !== "string") {
      return res.status(400).json({ error: "Missing 'url' in request body" });
    }

    const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY;
    const RAPIDAPI_HOST = process.env.RAPIDAPI_HOST || "instagram-downloader-scraper-reels-igtv-posts-stories.p.rapidapi.com";

    if (!RAPIDAPI_KEY) {
      return res.status(500).json({ error: "RapidAPI key not configured (RAPIDAPI_KEY)" });
    }

    const endpoint = `https://${RAPIDAPI_HOST}/scraper?url=${encodeURIComponent(url)}`;

    const rapidRes = await fetch(endpoint, {
      method: "GET",
      headers: {
        "x-rapidapi-host": RAPIDAPI_HOST,
        "x-rapidapi-key": RAPIDAPI_KEY
      },
      // optional: add a timeout handling if needed
    });

    const text = await rapidRes.text();

    // Try parse JSON; if not JSON return snippet for debugging
    let data;
    try {
      data = JSON.parse(text);
    } catch (err) {
      // Return helpful debug response (do NOT leak keys)
      return res.status(502).json({
        error: "Upstream returned non-JSON response",
        status: rapidRes.status,
        snippet: text.slice(0, 2000) // short snippet to debug structure
      });
    }

    // Forward the parsed data
    return res.status(200).json({ status: rapidRes.status, data });
  } catch (err) {
    console.error("extract error:", err);
    return res.status(500).json({ error: "Internal server error", detail: err.message });
  }
}
