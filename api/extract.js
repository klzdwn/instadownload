// /api/extract.js
export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST")
    return res.status(405).json({ error: "Use POST" });

  try {
    const { url } = req.body || {};
    if (!url) return res.status(400).json({ error: "Missing URL" });

    const upstream = `https://instasave.deno.dev/api?url=${encodeURIComponent(url)}`;

    const response = await fetch(upstream, {
      headers: { "User-Agent": "Mozilla/5.0" },
    });

    const text = await response.text();
    let json;
    try {
      json = JSON.parse(text);
    } catch (e) {
      return res.status(502).json({
        error: "Upstream not JSON",
        snippet: text.slice(0, 2000),
      });
    }

    if (!json || !json.media) {
      return res.status(200).json({
        status: "NO_MEDIA",
        snippet: text.slice(0, 2000),
      });
    }

    const items = json.media.map(m => ({
      media: m.url,
      thumb: m.thumbnail || json.thumbnail || null,
      isVideo: m.type === "video",
    }));

    return res.status(200).json({
      status: 200,
      data: items,
      used: upstream,
    });

  } catch (err) {
    return res.status(500).json({ error: String(err) });
  }
}
