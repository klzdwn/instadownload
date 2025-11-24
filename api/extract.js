// api/extract.js
export default async function handler(req, res) {
  // --- CORS SETUP ---
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  // --- ENDPOINT WAJIB POST ---
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed, use POST" });
  }

  try {
    // --- AMBIL BODY POST ---
    const body = req.body || await new Promise(resolve => {
      let raw = "";
      req.on("data", chunk => raw += chunk);
      req.on("end", () => {
        try { resolve(JSON.parse(raw || "{}")); }
        catch { resolve({}); }
      });
    });

    const { url } = body;

    if (!url || typeof url !== "string") {
      return res.status(400).json({ error: "Missing 'url' in request body" });
    }

    // --- ENV KEYS ---
    const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY;
    const RAPIDAPI_HOST =
      process.env.RAPIDAPI_HOST ||
      "instagram-downloader-scraper-reels-igtv-posts-stories.p.rapidapi.com";

    if (!RAPIDAPI_KEY) {
      return res.status(500).json({
        error: "RapidAPI key not configured (RAPIDAPI_KEY)"
      });
    }

    // --- RAPID API ENDPOINT ---
    const endpoint = `https://${RAPIDAPI_HOST}/scraper?url=${encodeURIComponent(url)}`;

    const rapidRes = await fetch(endpoint, {
      method: "GET",
      headers: {
        "x-rapidapi-host": RAPIDAPI_HOST,
        "x-rapidapi-key": RAPIDAPI_KEY
      }
    });

    const rawText = await rapidRes.text();

    // --- COBA PARSE JSON ---
    let data;
    try {
      data = JSON.parse(rawText);
    } catch {
      return res.status(502).json({
        error: "Upstream returned non-JSON response",
        status: rapidRes.status,
        snippet: rawText.slice(0, 2000) // buat debug kalo kena captcha / challenge
      });
    }

    // --- RETURN SUKSES ---
    return res.status(200).json({
      status: rapidRes.status,
      data
    });

  } catch (err) {
    console.error("extract error:", err);
    return res.status(500).json({
      error: "Internal server error",
      detail: err.message
    });
  }
}
