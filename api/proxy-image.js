// /api/proxy-image.js
export default async function handler(req, res) {
  const url = req.query.url;

  if (!url) {
    return res.status(400).send("Missing url parameter");
  }

  try {
    const upstream = await fetch(url);
    const contentType = upstream.headers.get("content-type") || "image/jpeg";

    const arrayBuffer = await upstream.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    res.setHeader("Content-Type", contentType);
    res.setHeader("Cache-Control", "public, max-age=86400"); // cache 1 day
    return res.send(buffer);

  } catch (err) {
    console.error("Proxy image error:", err);
    res.status(500).send("Failed to fetch image");
  }
}
