// /api/extract.js — Instagram OEmbed + Media JSON extractor (WORKING 2025)

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Use POST" });

  try {
    const body = typeof req.body === "object" ? req.body : JSON.parse(req.body || "{}");
    const url = body?.url?.trim();
    if (!url) return res.status(400).json({ error: "Missing url" });

    // 1) Get IG OEmbed metadata
    const oembedURL = `https://www.instagram.com/oembed/?url=${encodeURIComponent(url)}`;

    const meta = await fetch(oembedURL, {
      headers: {
        "User-Agent": "Mozilla/5.0",
        "Accept": "application/json"
      }
    });

    if (!meta.ok) {
      return res.status(400).json({ error: "OEmbed failed", code: meta.status });
    }

    const info = await meta.json();

    // Extract shortcode from OEmbed
    const match = info.thumbnail_url.match(/\/([A-Za-z0-9_-]+)_n/);
    let shortcode = null;

    if (match && match[1]) {
      shortcode = info.thumbnail_url.split("/")[4]; // reliable
    } else {
      // fallback: parse from original URL
      const m2 = url.match(/\/(p|reel|tv)\/([^\/]+)/i);
      if (m2) shortcode = m2[2];
    }

    if (!shortcode) {
      return res.status(400).json({ error: "Could not extract shortcode." });
    }

    // 2) Fetch real media JSON from IG V1 endpoint
    const apiURL = `https://www.instagram.com/p/${shortcode}/?__a=1&__d=dis`;

    const igDataRes = await fetch(apiURL, {
      headers: {
        "User-Agent": "Mozilla/5.0",
        "Accept": "application/json"
      }
    });

    if (!igDataRes.ok) {
      return res.status(400).json({ error: "Media JSON request failed", status: igDataRes.status });
    }

    const igJSON = await igDataRes.json();

    // Locate media node
    const media = igJSON.items?.[0] || igJSON.graphql?.shortcode_media;

    if (!media) {
      return res.status(200).json({ data: [] });
    }

    const items = [];

    // Carousel
    if (media.carousel_media) {
      for (let m of media.carousel_media) {
        const isVideo = m.media_type === 2;
        items.push({
          thumb: m.image_versions2?.candidates?.[0]?.url || null,
          media: isVideo ? m.video_versions?.[0]?.url : m.image_versions2?.candidates?.[0]?.url,
          isVideo
        });
      }
    } else {
      // Single media
      const isVideo = media.media_type === 2;
      items.push({
        thumb: media.image_versions2?.candidates?.[0]?.url || null,
        media: isVideo ? media.video_versions?.[0]?.url : media.image_versions2?.candidates?.[0]?.url,
        isVideo
      });
    }

    return res.status(200).json({
      status: 200,
      data: items
    });

  } catch (e) {
    return res.status(500).json({
      error: "Server error",
      detail: e.toString()
    });
  }
}
