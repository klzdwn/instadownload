// /api/thumb.js
export default async function handler(req, res) {
  const url = req.query.url;
  if (!url) return res.status(400).send("Missing url");

  try {
    const r = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0" }
    });

    const buf = Buffer.from(await r.arrayBuffer());

    res.setHeader("Content-Type", r.headers.get("content-type") || "image/jpeg");
    res.setHeader("Cache-Control", "public, max-age=86400");

    return res.send(buf);
  } catch (err) {
    return res.status(500).send("thumb fetch fail");
  }
}
