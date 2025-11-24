// /api/extract.js
export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Use POST" });

  try {
    const { url } = req.body || {};
    if (!url) return res.status(400).json({ error: "URL missing" });

    // helper fetch with UA
    const doFetch = async (u) => {
      return fetch(u, { headers: { "User-Agent": "Mozilla/5.0" } });
    };

    // 1) Fast path: try OG tags on the given page
    try {
      const r = await doFetch(url);
      const html = await r.text();
      const vid = html.match(/<meta property="og:video" content="([^"]+)"/);
      const img = html.match(/<meta property="og:image" content="([^"]+)"/);
      if (vid || img) {
        const result = [
          {
            media: vid ? vid[1] : img[1],
            thumb: img ? img[1] : null,
            isVideo: !!vid
          }
        ];
        return res.status(200).json({ status: 200, data: result });
      }
      // fallthrough to fallback
    } catch (e) {
      // ignore and fallback
    }

    // 2) Fallback: use snapinsta.app scraping endpoint
    //    (common pattern seen on many public downloaders)
    const snapUrl = `https://snapinsta.app/action.php?url=${encodeURIComponent(url)}`;
    const snapRes = await doFetch(snapUrl);
    const snapHtml = await snapRes.text();

    // Try to find direct media links (mp4 / jpg / jpeg / png / webp)
    // This regex finds https://... .mp4 or image extensions (allows querystring)
    const regex = /https?:\/\/[^"'\s>]+?\.(mp4|m3u8|jpg|jpeg|png|webp)(?:\?[^"'<> ]*)?/gi;
    const matches = [...new Set((snapHtml.match(regex) || []))];

    if (!matches.length) {
      // Return debug snippet so frontend can show why
      return res.status(200).json({
        status: "NO_MEDIA",
        message: "No media links found in snapinsta response",
        snippet: snapHtml.slice(0, 800),
        original_url: url
      });
    }

    // Build result array
    const items = matches.map((m) => {
      const isVideo = /\.mp4|\.m3u8/i.test(m) || /video/i.test(m);
      return {
        media: m,
        thumb: isVideo ? null : m,
        isVideo
      };
    });

    return res.status(200).json({
      status: 200,
      data: items
    });

  } catch (err) {
    console.error("extract error:", err);
    return res.status(500).json({ error: true, detail: String(err) });
  }
}
