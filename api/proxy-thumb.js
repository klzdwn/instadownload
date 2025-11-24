// /api/proxy-thumb.js
// Vercel serverless function: proxy thumbnail images from allowed IG hosts.
// Usage: /api/proxy-thumb?u=https%3A%2F%2Fscontent-ber1-1.cdninstagram.com%2F...
export default async function handler(req, res) {
  // CORS: allow frontend to load images from same origin
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed; use GET" });

  const urlParam = req.query.u || req.url && new URL(req.url, `http://${req.headers.host}`).searchParams.get("u");
  if (!urlParam) return res.status(400).json({ error: "Missing 'u' query parameter" });

  let target;
  try {
    target = decodeURIComponent(String(urlParam));
  } catch (e) {
    return res.status(400).json({ error: "Invalid url encoding" });
  }

  // validate URL and allowed hosts to avoid open proxy
  let parsed;
  try {
    parsed = new URL(target);
  } catch (e) {
    return res.status(400).json({ error: "Invalid URL" });
  }

  const allowedHosts = [
    "scontent.cdninstagram.com",
    "scontent-ber1-1.cdninstagram.com",
    "scontent-xx-1.cdninstagram.com",
    "instagram.fcdninstagram.com",
    "instagram.ffw1-1.fna.fbcdn.net",
    "instagram.frkv1-2.fna.fbcdn.net",
    "cdninstagram.com",
    "fbcdn.net",
    "scontent.cdninstagram.com"
  ];

  const hostOk = allowedHosts.some(h => parsed.hostname.endsWith(h) || parsed.hostname === h);
  if (!hostOk) {
    return res.status(403).json({ error: "Host not allowed" });
  }

  // Fetch the image and stream back
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    const upstream = await fetch(target, {
      method: "GET",
      headers: {
        // send a common user-agent to reduce chances of blocking
        "User-Agent": "Mozilla/5.0 (compatible; ImageProxy/1.0)",
        "Accept": "image/*,*/*;q=0.8"
      },
      signal: controller.signal
    });

    clearTimeout(timeout);

    if (!upstream.ok) {
      // upstream returned error (403/4xx/5xx)
      const txt = await upstream.text().catch(() => "");
      return res.status(502).json({ error: "Upstream returned error", status: upstream.status, snippet: txt.slice(0, 500) });
    }

    // forward content-type and length
    const contentType = upstream.headers.get("content-type") || "application/octet-stream";
    const contentLength = upstream.headers.get("content-length");

    res.setHeader("Content-Type", contentType);
    if (contentLength) res.setHeader("Content-Length", contentLength);
    // allow caching at edge for short time
    res.setHeader("Cache-Control", "public, max-age=3600, s-maxage=7200");

    // stream to client
    const body = upstream.body;
    if (!body) {
      const buf = await upstream.arrayBuffer();
      res.send(Buffer.from(buf));
      return;
    }

    // pipe readable stream to response
    const reader = body.getReader();
    res.status(200);

    // Node-compatible stream: read chunks and write
    async function pump() {
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          res.write(Buffer.from(value));
        }
        res.end();
      } catch (err) {
        try { res.end(); } catch(e){}
      }
    }
    pump();
  } catch (err) {
    console.error("proxy-thumb error:", err && err.message ? err.message : err);
    if (err.name === "AbortError") return res.status(504).json({ error: "Upstream timeout" });
    return res.status(500).json({ error: "Proxy failed", detail: String(err && err.message ? err.message : err) });
  }
}
