// /api/thumb.js
// Proxy thumbnail image to avoid CORS/hotlink problems.
// Usage: /api/thumb?url=<encoded-image-url>

export default async function handler(req, res) {
  // Allow CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(204).end();
  const url = (req.query && req.query.url) ? String(req.query.url) : (req.url ? (new URL(req.url, `http://${req.headers.host}`)).searchParams.get("url") : null);
  if (!url) return res.status(400).send("Missing url");

  try {
    // basic validation to avoid internal fetch
    if (!/^https?:\/\//i.test(url)) return res.status(400).send("Invalid url");

    // fetch the image
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    const upstream = await fetch(url, {
      method: "GET",
      headers: {
        // try to mimic browser to avoid 403
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
                      "(KHTML, like Gecko) Chrome/120.0 Safari/537.36",
        "Accept": "image/*,*/*;q=0.8"
      },
      signal: controller.signal
    }).catch(err => {
      clearTimeout(timeout);
      throw err;
    });

    clearTimeout(timeout);

    if (!upstream || !upstream.ok) {
      return res.status(502).send("Failed to fetch image");
    }

    const contentType = upstream.headers.get("content-type") || "application/octet-stream";
    res.setHeader("Content-Type", contentType);
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");

    // stream as arrayBuffer (Vercel serverless doesn't expose piping easily)
    const buf = Buffer.from(await upstream.arrayBuffer());
    res.status(200).send(buf);

  } catch (err) {
    console.error("thumb proxy error:", err && err.stack ? err.stack : err);
    if (err.name === "AbortError") return res.status(504).send("Upstream timeout");
    return res.status(500).send("Proxy error");
  }
}
