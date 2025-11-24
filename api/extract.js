export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Use POST" });

  try {
    const { url } = req.body || {};
    if (!url) return res.status(400).json({ error: "URL missing" });

    const api = `https://api.igdownloader.app/api/v1/instagram?url=${encodeURIComponent(url)}`;

    const ig = await fetch(api);
    const data = await ig.json();

    if (!data || !data.url_list) {
      return res.status(200).json({
        status: "NO_MEDIA",
        message: "Media tidak ditemukan"
      });
    }

    return res.status(200).json({
      status: 200,
      data: data.url_list.map(m => ({
        media: m,
        isVideo: m.includes(".mp4")
      }))
    });

  } catch (err) {
    return res.status(500).json({
      error: true,
      detail: String(err)
    });
  }
}
