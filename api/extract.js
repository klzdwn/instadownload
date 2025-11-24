export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { url } = req.body || {};
  if (!url || typeof url !== "string") {
    return res.status(400).json({ error: "Invalid URL." });
  }

  let lastHtmlSnippet = null;

  async function fetchText(u, headers = {}) {
    try {
      const r = await fetch(u, { headers });
      const t = await r.text();
      lastHtmlSnippet = t.slice(0, 2000);
      return t;
    } catch (e) {
      return null;
    }
  }

  async function fetchJson(u, headers = {}) {
    try {
      const r = await fetch(u, { headers });
      const txt = await r.text();
      lastHtmlSnippet = txt.slice(0, 2000);
      return JSON.parse(txt);
    } catch {
      return null;
    }
  }

  const headers = {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119 Safari/537.36",
    "Accept-Language": "en-US,en;q=0.9",
  };

  const direct1 = url.split("?")[0] + "/?__a=1&__d=dis";
  const direct2 = url + "?__a=1&__d=dis";

  let json = await fetchJson(direct1, headers);
  if (!json) json = await fetchJson(direct2, headers);

  // NEW: if still no JSON, try extracting ld+json from HTML
  if (!json) {
    const html = await fetchText(url, headers);
    if (html) {
      try {
        const match = html.match(
          /<script type="application\/ld\+json">([\s\S]*?)<\/script>/
        );
        if (match) {
          json = JSON.parse(match[1]);
        }
      } catch {}
    }
  }

  // If still no JSON → return debug output
  if (!json) {
    return res.status(200).json({
      status: "NO_JSON_DEBUG",
      message: "Instagram returned non-JSON page.",
      snippet: lastHtmlSnippet || "(empty)",
      original_url: url
    });
  }

  // Extract media
  let items = [];

  function tryPush(o) {
    if (!o) return;
    items.push({
      thumb: o.thumbnail_url || o.display_url || null,
      media: o.video_url || o.display_url || null,
      isVideo: !!o.video_url,
    });
  }

  try {
    const g = json.graphql || json.data?.graphql;
    const media = g?.shortcode_media;
    if (media) {
      if (media.edge_sidecar_to_children) {
        media.edge_sidecar_to_children.edges.forEach((e) =>
          tryPush(e.node)
        );
      } else {
        tryPush(media);
      }
    }
  } catch {}

  // ld+json fallback
  if (items.length === 0 && json.contentUrl) {
    items.push({
      thumb: json.thumbnailUrl || null,
      media: json.contentUrl || null,
      isVideo: json["@type"] === "VideoObject",
    });
  }

  if (items.length === 0) {
    return res.status(200).json({
      status: "EMPTY",
      message: "JSON found, but no media inside.",
      snippet: lastHtmlSnippet || "(empty)",
      json,
    });
  }

  res.status(200).json({
    status: 200,
    data: items,
  });
}
