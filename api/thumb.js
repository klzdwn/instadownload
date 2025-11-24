// /api/thumb.js
// Proxy untuk thumbnail Instagram CDN (agar tidak diblock oleh CORS/user-agent)

export default async function handler(req, res) {
  try {
    const url = req.query.url;
    if (!url) {
      return res.status(400).json({ error: "Missing ?url=" });
    }

    // fetch gambar dari instagram CDN
    const upstream = await fetch(url, {
      method: "GET",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
        "Accept": "image/*"
      }
    });

    if (!upstream.ok) {
      return res.status(502).json({
        error: "Failed fetch thumb",
        status: upstream.status,
      });
    }

    // ambil buffer
    const buf = Buffer.from(await upstream.arrayBuffer());

    // set header image
    res.setHeader("Content-Type", upstream.headers.get("content-type") || "image/jpeg");
    res.setHeader("Cache-Control", "public, max-age=86400"); // 1 day caching

    return res.status(200).send(buf);

  } catch (e) {
    return res.status(500).json({ error: "Proxy error", detail: String(e) });
  }
}
