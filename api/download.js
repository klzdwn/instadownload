// /api/download.js
// Vercel / Next.js API route that proxies a media URL and returns it as an attachment.
// Save as /api/download.js
export default async function handler(req, res) {
  // CORS - sesuaikan origin bila perlu
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed, use GET" });
  }

  try {
    // get url from query (Next.js provides req.query)
    const url = (req.query && req.query.url) ? String(req.query.url) : null;

    if (!url) {
      return res.status(400).json({ error: "Missing 'url' query parameter" });
    }

    let parsed;
    try {
      parsed = new URL(url);
    } catch (e) {
      return res.status(400).json({ error: "Invalid url" });
    }

    // OPTIONAL: restrict to known CDN/instagram domains to reduce abuse
    const allowHosts = [
      "scontent-ber1-1.cdninstagram.com",
      "scontent.cdninstagram.com",
      "scontent-xx-1.cdninstagram.com",
      "instagram.frkv1-2.fna.fbcdn.net",
      "instagram.fsnc1-1.fna.fbcdn.net",
      "cdninstagram.com",
      "fbcdn.net",
      "fna.fbcdn.net",
      "instagramcdn.com",
      "cdninstagram"
    ];
    const hostOk = allowHosts.some(h => parsed.hostname.includes(h) || parsed.hostname === h);
    if (!hostOk) {
      // don't be too strict if you want, but this helps avoid open-proxy abuse
      return res.status(403).json({ error: "Host not allowed" });
    }

    // fetch upstream with timeout
    const controller = new AbortController();
    const timeoutMs = 20000; // 20s
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    let upstream;
    try {
      upstream = await fetch(url, { method: "GET", signal: controller.signal });
    } catch (err) {
      clearTimeout(timeout);
      if (err && err.name === "AbortError") {
        return res.status(504).json({ error: "Upstream timeout" });
      }
      console.error("fetch error", err && err.message ? err.message : err);
      return res.status(502).json({ error: "Failed to fetch upstream", detail: String(err) });
    }
    clearTimeout(timeout);

    if (!upstream.ok) {
      const txt = await upstream.text().catch(() => "");
      return res.status(502).json({ error: "Upstream responded with error", status: upstream.status, snippet: txt.slice(0, 1000) });
    }

    // Get content-type and buffer
    const contentType = upstream.headers.get("content-type") || "application/octet-stream";

    // arrayBuffer -> Buffer
    const arr = await upstream.arrayBuffer();
    const buffer = Buffer.from(arr);

    // try to generate sensible filename from URL path
    const pathname = parsed.pathname || "";
    let filename = pathname.split("/").pop() || "file";
    // if filename doesn't have extension, infer from content-type
    if (!filename.includes(".")) {
      if (contentType.includes("jpeg") || contentType.includes("jpg")) filename += ".jpg";
      else if (contentType.includes("png")) filename += ".png";
      else if (contentType.includes("gif")) filename += ".gif";
      else if (contentType.includes("mp4") || contentType.includes("video")) filename += ".mp4";
      else filename += ".bin";
    }

    // set headers for download
    res.setHeader("Content-Type", contentType);
    res.setHeader("Content-Length", String(buffer.length));
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    // optional caching
    res.setHeader("Cache-Control", "public, max-age=86400");

    // send buffer
    return res.status(200).send(buffer);
  } catch (err) {
    console.error("download handler error:", err && err.stack ? err.stack : err);
    return res.status(500).json({ error: "Internal server error" });
  }
}
