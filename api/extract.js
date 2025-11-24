export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Use POST" });

  try {
    const { url } = req.body || {};
    if (!url) return res.status(400).json({ error: "URL missing" });

    // Fetch HTML Instagram
    const ig = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0" }
    });

    const html = await ig.text();

    // Try extract video
    const videoMatch = html.match(
      /<meta property="og:video" content="([^"]+)"/
    );
    const imageMatch = html.match(
      /<meta property="og:image" content="([^"]+)"/
    );

    if (!videoMatch && !imageMatch) {
      return res.status(200).json({
        status: "NO_MEDIA",
        error: "No og tags found",
        snippet: html.slice(0, 500)
      });
    }

    const result = [
      {
        media: videoMatch ? videoMatch[1] : imageMatch[1],
        thumb: imageMatch ? imageMatch[1] : null,
        isVideo: !!videoMatch
      }
    ];

    return res.status(200).json({
      status: 200,
      data: result
    });

  } catch (err) {
    return res.status(500).json({
      error: true,
      detail: String(err)
    });
  }
}
