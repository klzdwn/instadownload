import fetch from "node-fetch";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Use POST" });

  try {
    const { url } = req.body || {};
    if (!url) return res.status(400).json({ error: "URL missing" });

    // request ke snapsave
    const snapsave = await fetch("https://snapsave.app/action.php", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": "Mozilla/5.0"
      },
      body: `url=${encodeURIComponent(url)}&lang=id`
    });

    const html = await snapsave.text();

    // cari tag <a href="https://...mp4">
    const links = [...html.matchAll(/href="([^"]+\.mp4[^"]*)"/g)].map(m => m[1]);

    if (!links.length) {
      return res.status(200).json({
        status: "NO_MEDIA",
        message: "Tidak menemukan link video.",
        snippet: html.slice(0, 1000)
      });
    }

    return res.status(200).json({
      status: 200,
      data: links.map(v => ({
        media: v,
        thumb: null,
        isVideo: true
      }))
    });

  } catch (err) {
    return res.status(500).json({
      error: true,
      detail: String(err)
    });
  }
}
