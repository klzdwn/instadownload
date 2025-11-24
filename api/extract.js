export default async function handler(req, res) {
  try {
    const url = req.query.url;
    if (!url) return res.status(400).json({ error: "Missing url" });

    const api = `https://instasave.deno.dev/api?url=${encodeURIComponent(url)}`;

    const r = await fetch(api);
    const data = await r.json();

    if (!data || !data.media) {
      return res.status(404).json({ error: "No media found" });
    }

    res.status(200).json({
      status: 200,
      data: data.media
    });

  } catch (err) {
    res.status(500).json({ error: "Server error", detail: err.message });
  }
}
