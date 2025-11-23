// api/extract.js  (Vercel Serverless)
// POST { "url": "https://www.instagram.com/..." }
// Response JSON always. CORS enabled.

export default async function handler(req, res) {
  // Only allow POST
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(204).end();
  }
  if (req.method !== 'POST') {
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Access-Control-Allow-Origin', '*');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');

  try {
    const body = (typeof req.body === 'string') ? JSON.parse(req.body || '{}') : (req.body || {});
    const url = body && body.url ? String(body.url).trim() : '';

    if (!url || !/^https?:\/\/(www\.)?instagram\.com\/.+/i.test(url)) {
      return res.status(400).json({ error: 'URL tidak valid' });
    }

    // fetch with timeout using AbortController
    const controller = new AbortController();
    const timeoutMs = 10000;
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    const resp = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; IGDownloader/1.0)',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      },
      redirect: 'follow',
      signal: controller.signal
    }).catch(err => {
      if (err.name === 'AbortError') throw { code: 0, message: 'timeout' };
      throw err;
    });

    clearTimeout(timeout);

    if (!resp) throw { code: 0, message: 'No response' };

    // If IG returns 429 or redirects to login, surface that
    if (resp.status === 429) return res.status(429).json({ error: 'Instagram rate limit (429)' });
    if (resp.status >= 500) return res.status(502).json({ error: `Instagram fetch failed: ${resp.status}` });

    const html = await resp.text();

    // helper to replace escaped ampersands
    const unescapeStr = s => (typeof s === 'string') ? s.replace(/\\u0026/g, '&') : s;

    // 1) meta tags (og:video, og:image)
    let m = html.match(/<meta[^>]*property=["']og:video:secure_url["'][^>]*content=["']([^"']+)["']/i)
         || html.match(/<meta[^>]*property=["']og:video["'][^>]*content=["']([^"']+)["']/i)
         || html.match(/<meta[^>]*property=["']og:image:secure_url["'][^>]*content=["']([^"']+)["']/i)
         || html.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i);

    if (m && m[1]) {
      return res.status(200).json({ media_url: unescapeStr(m[1]) });
    }

    // 2) direct JSON tokens like "video_url":"..."
    let v = html.match(/"video_url"\s*:\s*"([^"]+)"/);
    if (v && v[1]) return res.status(200).json({ media_url: unescapeStr(v[1]) });

    // 3) display_url token
    let i = html.match(/"display_url"\s*:\s*"([^"]+)"/);
    if (i && i[1]) return res.status(200).json({ media_url: unescapeStr(i[1]) });

    // 4) window._sharedData or similar (use [\s\S] instead of /s)
    const sharedMatch = html.match(/window\._sharedData\s*=\s*(\{[\s\S]*?\});\s*<\/script>/);
    if (sharedMatch && sharedMatch[1]) {
      try {
        const shared = JSON.parse(sharedMatch[1]);
        const entryData = shared.entry_data || shared.entryData || shared.entryData || shared;
        // walk possible structures
        const candidates = [];

        if (entryData && typeof entryData === 'object') {
          // collect possible media nodes
          const values = Object.values(entryData);
          for (const v0 of values) {
            if (Array.isArray(v0)) {
              for (const it of v0) candidates.push(it);
            } else candidates.push(v0);
          }
        }

        for (const p of candidates) {
          const media = p?.[0]?.graphql?.shortcode_media || p?.graphql?.shortcode_media || p;
          if (!media) continue;
          // video preferred
          if (media.is_video && media.video_url) return res.status(200).json({ media_url: media.video_url });
          if (media.display_url) return res.status(200).json({ media_url: media.display_url });
          // carousel
          if (media.edge_sidecar_to_children && media.edge_sidecar_to_children.edges) {
            const first = media.edge_sidecar_to_children.edges[0]?.node;
            if (first?.is_video && first?.video_url) return res.status(200).json({ media_url: first.video_url });
            if (first?.display_url) return res.status(200).json({ media_url: first.display_url });
          }
        }
      } catch(e){
        // ignore parse error, continue fallback
      }
    }

    // 5) try to find JSON-LD <script type="application/ld+json"> ... (some posts)
    const ldJsonMatch = html.match(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/i);
    if (ldJsonMatch && ldJsonMatch[1]) {
      try {
        const ld = JSON.parse(ldJsonMatch[1]);
        if (ld && ld.contentUrl) return res.status(200).json({ media_url: ld.contentUrl });
        if (ld && ld.image) return res.status(200).json({ media_url: ld.image });
      } catch(e){}
    }

    // nothing found
    return res.status(404).json({ error: 'Media tidak ditemukan (mungkin private atau struktur berubah).' });

  } catch (err) {
    // Normalize error objects thrown above
    const code = err && err.code ? err.code : 0;
    const msg = err && err.message ? String(err.message) : String(err || 'Unknown error');

    if (code === 429) return res.status(429).json({ error: 'Instagram rate limit (429)' });

    // timeout
    if (msg && msg.toLowerCase().includes('timeout')) {
      return res.status(504).json({ error: 'Request timed out' });
    }

    console.error('extract error:', err);
    return res.status(500).json({ error: 'Server error', details: msg });
  }
}
