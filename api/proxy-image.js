// /api/proxy-image.js
export default async function handler(req, res) {
  const url = req.query.url;
  if (!url) return res.status(400).send("Missing url parameter");

  try {
    const upstream = await fetch(url, { method: "GET" });
    if (!upstream.ok) {
      return res.status(502).send("Upstream image fetch failed");
    }
    const contentType = upstream.headers.get("content-type") || "image/jpeg";
    const arr = await upstream.arrayBuffer();
    const buffer = Buffer.from(arr);

    res.setHeader("Content-Type", contentType);
    res.setHeader("Cache-Control", "public, max-age=86400");
    return res.send(buffer);
  } catch (err) {
    console.error("Proxy image error:", err);
    return res.status(500).send("Failed to fetch image");
  }
}
