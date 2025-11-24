// api/extract.js
// Minimal resilient extractor for Instagram pages
// Usage: POST { url: "https://www.instagram.com/..." }

const TIMEOUT = 15000;

function safeJSONParse(txt) {
  try { return JSON.parse(txt); } catch (e) { return null; }
}

function findScriptJsonById(html, id) {
  // <script id="__a" type="application/json">...</script>
  const re = new RegExp(`<script[^>]*id=["']${id}["'][^>]*>([\\s\\S]*?)<\\/script>`, 'i');
  const m = html.match(re);
  return m && m[1] ? m[1].trim() : null;
}

function findLdJson(html) {
  // <script type="application/ld+json">...</script>
  const re = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/i;
  const m = html.match(re);
  return m && m[1] ? m[1].trim() : null;
}

function findWindowJson(html) {
  // try patterns like: window._sharedData = {...}; or window.__additionalDataLoaded('/p/..', {...})
  let re = /window\._sharedData\s*=\s*({[\s\S]*?});/;
  let m = html.match(re);
  if (m && m[1]) return m[1];

  re = /window\.__additionalDataLoaded\([^,]+,\s*({[\s\S]*?})\s*\);/;
  m = html.match(re);
  if (m && m[1]) return m[1];

  // fallback: find any big JSON blob in <script> tags (heuristic)
  re = /<script[^>]*>\s*({\s*".{1,20}":)/g;
  m = re.exec(html);
  if (m) {
    // find closing } that ends the JSON - naive balancing
    const start = m.index + m[0].indexOf('{');
    // attempt to extract until the next </script>
    const rest = html.slice(start, html.indexOf('</script>', start) + 9);
    const cut = rest.split('</script>')[0];
    return cut.trim();
  }

  return null;
}

function normalizeItemsFromJson(obj) {
  // This function inspects common shapes and returns array of items { thumb, media, isVideo }
  if (!obj) return [];

  // common: direct array
  if (Array.isArray(obj)) {
    return obj.map(i => ({
      thumb: i.thumb || i.thumbnail || i.poster || i.display_url || i.display_src || null,
      media: i.media || i.url || i.video_url || i.video || (i.resources && i.resources[0] && i.resources[0].src) || null,
      isVideo: !!(i.is_video || i.isVideo || i.video || /mp4|video/.test(String(i.media || i.url || i.video || '')))
    }));
  }

  // instagram layout newer: might have .entry_data.PostPage[0].graphql.shortcode_media or
  // .entry_data.PostPage[0].graphql.shortcode_media.edge_sidecar_to_children.edges
  try {
    // try common window._sharedData shape
    const shared = obj.entry_data || obj;
    // PostPage
    if (shared.entry_data && Array.isArray(shared.entry_data.PostPage)) {
      const post = shared.entry_data.PostPage[0].graphql?.shortcode_media;
      if (post) {
        // single or carousel
        if (post.edge_sidecar_to_children && post.edge_sidecar_to_children.edges) {
          return post.edge_sidecar_to_children.edges.map(e => {
            const n = e.node || {};
            return {
              thumb: n.display_url || n.thumbnail_src || null,
              media: n.is_video ? (n.video_url || n.video_resources && n.video_resources[0] && n.video_resources[0].src) : (n.display_url || null),
              isVideo: !!n.is_video
            };
          });
        } else {
          return [{
            thumb: post.display_url || post.thumbnail_src || null,
            media: post.is_video ? (post.video_url || null) : (post.display_url || null),
            isVideo: !!post.is_video
          }];
        }
      }
    }

    // Reels / profiles might have "graphql.shortcode_media" directly
    if (obj.graphql && obj.graphql.shortcode_media) {
      const media = obj.graphql.shortcode_media;
      if (media.edge_sidecar_to_children) {
        return media.edge_sidecar_to_children.edges.map(e => {
          const n = e.node || {};
          return {
            thumb: n.display_url || n.thumbnail_src || null,
            media: n.is_video ? (n.video_url || null) : (n.display_url || null),
            isVideo: !!n.is_video
          };
        });
      } else {
        return [{
          thumb: media.display_url || media.thumbnail_src || null,
          media: media.is_video ? (media.video_url || null) : (media.display_url || null),
          isVideo: !!media.is_video
        }];
      }
    }

    // ld+json -> image object / itemListElement
    if (obj['@type'] && (obj['@type'] === 'ImageObject' || obj['@type'] === 'VideoObject')) {
      return [{
        thumb: obj.thumbnailUrl || obj.image || null,
        media: obj.contentUrl || obj.embedUrl || obj.video || obj.image || null,
        isVideo: obj['@type'] === 'VideoObject'
      }];
    }

    // fallback: try common paths used by some scrapers
    const possible = obj.items || obj.data || obj.media || obj.media_items || obj.mediaData;
    if (Array.isArray(possible)) {
      return normalizeItemsFromJson(possible);
    }
  } catch (e) {
    // ignore
  }

  return [];
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const { url } = req.body || {};
  if (!url) {
    res.status(400).json({ error: 'Missing url' });
    return;
  }

  // fetch IG page with headers so server less likely blocked
  try {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), TIMEOUT);

    const resp = await fetch(url, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko)',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
      redirect: 'follow',
      signal: controller.signal
    });
    clearTimeout(id);

    const text = await resp.text();

    // quick check for common RapidAPI error or HTML that is not IG page
    if (resp.status >= 400) {
      res.status(502).json({ error: 'Upstream error', detail: `Status ${resp.status}` , snippet: text.slice(0, 2000) });
      return;
    }

    // try multiple extract strategies
    let jsonStr = null;
    let parsed = null;

    // 1) <script id="__a" type="application/json">...</script>
    jsonStr = findScriptJsonById(text, '__a') || findScriptJsonById(text, 'Initial-state') || null;
    if (jsonStr) parsed = safeJSONParse(jsonStr);

    // 2) ld+json
    if (!parsed) {
      const ld = findLdJson(text);
      if (ld) parsed = safeJSONParse(ld);
    }

    // 3) window.* JSON patterns
    if (!parsed) {
      const w = findWindowJson(text);
      if (w) parsed = safeJSONParse(w);
    }

    // 4) some pages return JSON inside "window.__additionalDataLoaded('/...',{...})"
    if (!parsed) {
      // try extract object from window.__additionalDataLoaded occurrences
      const reAdd = /window\.__additionalDataLoaded\([^,]+,\s*({[\s\S]*?})\s*\);/g;
      let m;
      while ((m = reAdd.exec(text)) !== null) {
        const candidate = safeJSONParse(m[1]);
        if (candidate) {
          parsed = candidate;
          break;
        }
      }
    }

    // 5) last-ditch: try to find any JSON-looking block in <script> tags
    if (!parsed) {
      const anyJsonRe = /<script[^>]*>\s*({[\s\S]*})\s*<\/script>/g;
      let m;
      while ((m = anyJsonRe.exec(text)) !== null) {
        const cand = safeJSONParse(m[1]);
        if (cand) { parsed = cand; break; }
      }
    }

    // If still no parsed JSON, return debug
    if (!parsed) {
      res.status(200).json({
        status: 'NO_JSON_DEBUG',
        message: 'Instagram returned non-JSON page.',
        snippet: text.slice(0, 4000),
        original_url: url
      });
      return;
    }

    // normalize to item list
    const items = normalizeItemsFromJson(parsed);
    if (!items || !items.length) {
      // sometimes parsed is already array
      const alt = normalizeItemsFromJson(parsed.data || parsed.items || parsed);
      if (alt && alt.length) {
        res.status(200).json({ status: 200, data: alt });
        return;
      }

      res.status(200).json({
        status: 200,
        data: [{ thumb: null, media: null, isVideo: false }],
        warning: 'Parsed JSON but no media found. See parsed object keys for debug.',
        parsedKeys: Object.keys(parsed).slice(0,20)
      });
      return;
    }

    res.status(200).json({ status: 200, data: items });
  } catch (err) {
    console.error('extract error', err);
    res.status(500).json({ error: 'Server error', detail: String(err) });
  }
}
