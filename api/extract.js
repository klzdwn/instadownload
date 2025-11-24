// /api/extract.js — FINAL FIX (WORKING 2025) Instagram JSON Extractor

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

  try {
    const body = typeof req.body === "object" ? req.body : JSON.parse(req.body || "{}");
    const url = body.url;
    if (!url) return res.status(400).json({ error: "Missing url" });

    // ---- 1. Fetch OEmbed
    const oembed = await fetch(
      `https://www.instagram.com/oembed/?url=${encodeURIComponent(url)}`,
      {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
          "Accept": "application/json"
        }
      }
    );

    if (!oembed.ok) {
      return res.status(400).json({ error: "OEmbed error", code: oembed.status });
    }

    const meta = await oembed.json();

    // Ambil shortcode dari URL asli
    const match = url.match(/\/(p|reel|tv)\/([^\/]+)/i);
    if (!match) return res.status(400).json({ error: "Cannot extract shortcode" });
    const shortcode = match[2];

    // ---- 2. Fetch real JSON media
    const apiURL = `https://www.instagram.com/p/${shortcode}/?__a=1&__d=dis`;

    const ig = await fetch(apiURL, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
        "Accept": "application/json",
        "Referer": "https://www.instagram.com/",
        "Cookie": "ig_did=123; csrftoken=missing; mid=Yzk; ds_user_id=0;",
        "sec-ch-ua": '"Chromium";v="112", "Not-A.Brand";v="99"',
        "sec-ch-ua-mobile": "?0",
        "sec-ch-ua-platform": '"Windows"'
      }
    });

    const text = await ig.text();

    // If Instagram returned HTML instead of JSON
    if (text.startsWith("<")) {
      return res.status(400).json({
        error: "IG returned HTML (blocked).",
        snippet: text.slice(0, 500)
      });
    }

    let json;
    try {
      json = JSON.parse(text);
    } catch {
      return res.status(400).json({
        error: "Invalid JSON from Instagram",
        snippet: text.slice(0, 500)
      });
    }

    const media = json.items?.[0] || json.graphql?.shortcode_media;
    if (!media) return res.status(200).json({ data: [] });

    const out = [];

    // multiple media
    if (media.carousel_media) {
      for (let m of media.carousel_media) {
        const isVideo = m.media_type === 2;
        out.push({
          thumb: m.image_versions2?.candidates?.[0]?.url,
          media: isVideo ? m.video_versions?.[0]?.url : m.image_versions2?.candidates?.[0]?.url,
          isVideo
        });
      }
    } else {
      // single media
      const isVideo = media.media_type === 2;
      out.push({
        thumb: media.image_versions2?.candidates?.[0]?.url,
        media: isVideo ? media.video_versions?.[0]?.url : media.image_versions2?.candidates?.[0]?.url,
        isVideo
      });
    }

    return res.status(200).json({
      status: 200,
      data: out
    });

  } catch (e) {
    return res.status(500).json({
      error: "Server error",
      detail: e.toString()
    });
  }
}
