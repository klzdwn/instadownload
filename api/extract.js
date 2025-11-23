// api/extract.js (debug version)
// WARNING: only use this for debugging — it returns a snippet of remote HTML.
// Replace back to the previous (clean) version for production.

export default async function handler(req, res) {
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

    const controller = new AbortController();
    const timeoutMs = 12000;
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    const resp = await fetch(url, {
      headers: {
        // coba User-Agent real browser jika terblok
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      },
      redirect: 'follow',
      signal: controller.signal
    }).catch(err => {
      if (err.name === 'AbortError') throw { code: 'timeout', message: 'fetch timeout' };
      throw err;
    });

    clearTimeout(timer);

    if (!resp) throw { code: 'no_response', message: 'No response from fetch' };

    // read text for parsing & debugging
    const html = await resp.text();

    // quick checks
    if (resp.status === 429) return res.status(429).json({ error: 'Instagram rate limit (429)' });
    if (resp.status === 403 || /login|checkpoint|challenge/i.test(html)) {
      // return a trimmed snippet to see what's returned
      return res.status(403).json({
        error: 'Instagram returned login/challenge (blocked)',
        status: resp.status,
        snippet: html.slice(0, 2000)
      });
    }

    // helper unescape
    const unescapeStr = s => (typeof s==='string') ? s.replace(/\\u0026/g, '&') : s;

    // try meta tags
    let m = html.match(/<meta[^>]*property=["']og:video:secure_url["'][^>]*content=["']([^"']+)["']/i)
         || html.match(/<meta[^>]*property=["']og:video["'][^>]*content=["']([^"']+)["']/i)
         || html.match(/<meta[^>]*property=["']og:image:secure_url["'][^>]*content=["']([^"']+)["']/i)
         || html.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i);
    if (m && m[1]) return res.status(200).json({ media_url: unescapeStr(m[1]) });

    // try several JSON like patterns
    const patterns = [
      /"video_url"\s*:\s*"([^"]+)"/,
      /"display_url"\s*:\s*"([^"]+)"/,
      /"fallback_url"\s*:\s*"([^"]+)"/,
      /"url":"([^"]+\.mp4[^"]*)"/i
    ];
    for (const p of patterns) {
      const found = html.match(p);
      if (found && found[1]) return res.status(200).json({ media_url: unescapeStr(found[1]) });
    }

    // window._sharedData (use [\s\S] since /s may not be supported)
    const sharedMatch = html.match(/window\._sharedData\s*=\s*(\{[\s\S]*?\});\s*<\/script>/i);
    if (sharedMatch && sharedMatch[1]) {
      try {
        const shared = JSON.parse(sharedMatch[1]);
        const entryData = shared.entry_data || shared.entryData || shared;
        const nodes = [];
        if (entryData && typeof entryData === 'object') {
          for (const v of Object.values(entryData)) {
            if (Array.isArray(v)) nodes.push(...v);
            else nodes.push(v);
          }
        }
        for (const p of nodes) {
          const media = p?.[0]?.graphql?.shortcode_media || p?.graphql?.shortcode_media || p;
          if (!media) continue;
          if (media.is_video && media.video_url) return res.status(200).json({ media_url: media.video_url });
          if (media.display_url) return res.status(200).json({ media_url: media.display_url });
          if (media.edge_sidecar_to_children && media.edge_sidecar_to_children.edges) {
            const first = media.edge_sidecar_to_children.edges[0]?.node;
            if (first?.is_video && first?.video_url) return res.status(200).json({ media_url: first.video_url });
            if (first?.display_url) return res.status(200).json({ media_url: first.display_url });
          }
        }
      } catch(e){
        // JSON parse error -> continue to snippet return
      }
    }

    // JSON-LD fallback
    const ld = html.match(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/i);
    if (ld && ld[1]) {
      try {
        const parsed = JSON.parse(ld[1]);
        if (parsed && parsed.contentUrl) return res.status(200).json({ media_url: parsed.contentUrl });
        if (parsed && parsed.image) return res.status(200).json({ media_url: parsed.image });
      } catch(e){}
    }

    // nothing found -> return debug info with snippet
    return res.status(404).json({
      error: 'Media tidak ditemukan (debug)',
      status: resp.status,
      snippet: html.slice(0, 2000)
    });

  } catch (err) {
    const msg = err && err.message ? String(err.message) : String(err || 'Unknown');
    console.error('extract error:', err);
    if ((msg||'').toLowerCase().includes('timeout')) {
      return res.status(504).json({ error: 'timeout' });
    }
    return res.status(500).json({ error: 'server error', details: msg });
  }
}
