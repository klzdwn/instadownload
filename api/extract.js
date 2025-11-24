// /api/extract.js
export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Use POST" });

  try {
    // support JSON body or form-encoded
    let url = "";
    if (req.headers["content-type"] && req.headers["content-type"].includes("application/json")) {
      url = (req.body && req.body.url) ? req.body.url : "";
    } else {
      // sometimes platform posts raw body text
      url = req.body && typeof req.body === "string" ? req.body : (req.body && req.body.url ? req.body.url : "");
    }

    if (!url) return res.status(400).json({ error: "URL missing" });

    // call snapsave action endpoint (public)
    const snapsaveResp = await fetch("https://snapsave.app/action.php", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        "User-Agent": "Mozilla/5.0 (compatible; instadownload/1.0)"
      },
      body: `url=${encodeURIComponent(url)}&lang=id`
    });

    if (!snapsaveResp.ok) {
      return res.status(502).json({ error: "Upstream failed", status: snapsaveResp.status });
    }

    const html = await snapsaveResp.text();

    // try to extract direct video/image links from response HTML
    const results = [];

    // mp4 links
    for (const m of html.matchAll(/href=["']([^"']+\.mp4[^"']*)["']/gi)) {
      results.push({ media: m[1], thumb: null, isVideo: true });
    }

    // common CDN image links
    for (const m of html.matchAll(/href=["']([^"']+\.(?:jpg|jpeg|png)[^"']*)["']/gi)) {
      // avoid duplicates
      if (!results.some(r => r.media === m[1])) {
        results.push({ media: m[1], thumb: null, isVideo: false });
      }
    }

    // sometimes snapsave prints direct URLs inside data attributes or JS vars
    if (!results.length) {
      for (const m of html.matchAll(/(https?:\/\/[^"' >]+?(?:mp4|jpg|jpeg|png)(?:\?[^"' ]*)?)/gi)) {
        const urlFound = m[1];
        if (!results.some(r => r.media === urlFound)) {
          results.push({ media: urlFound, thumb: null, isVideo: /\.mp4/i.test(urlFound) });
        }
      }
    }

    if (!results.length) {
      return res.status(200).json({
        status: "NO_MEDIA",
        message: "Tidak menemukan link media di snapsave response.",
        snippet: html.slice(0, 1200)
      });
    }

    return res.status(200).json({
      status: 200,
      data: results
    });

  } catch (err) {
    console.error("extract error:", err);
    return res.status(500).json({
      error: true,
      detail: String(err)
    });
  }
}
