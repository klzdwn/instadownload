// api/extract.js  (Vercel)
export default async function handler(req, res) {
  // CORS preflight
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  try {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method not allowed" });
    }

    const { url } = req.body || {};
    if (!url || !/^https?:\/\/(www\.)?instagram\.com\//i.test(url)) {
      return res.status(400).json({ error: "URL tidak valid" });
    }

    const igResp = await fetch(url, {
      method: "GET",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Linux; Android 10; SM-G975F) AppleWebKit/537.36 (KHTML, like Gecko) Instagram 254.0.0.19.109 Mobile Safari/537.36",
        "Accept-Language": "en-US,en;q=0.9",
        "Referer": "https://www.instagram.com/",
        "Cache-Control": "no-cache"
      }
    });

    if (igResp.status === 429) {
      return res.status(429).json({ error: "Instagram rate limit (429)" });
    }
    if (!igResp.ok) {
      return res.status(502).json({ error: `Gagal fetch: ${igResp.status}` });
    }

    const html = await igResp.text();
    const unescape = s => String(s).replace(/\\u0026/g, "&");

    // coba meta og tags
    let m =
      html.match(/property=["']og:video:secure_url["'][^>]*content=["']([^"']+)["']/i) ||
      html.match(/property=["']og:video["'][^>]*content=["']([^"']+)["']/i) ||
      html.match(/property=["']og:image:secure_url["'][^>]*content=["']([^"']+)["']/i) ||
      html.match(/property=["']og:image["'][^>]*content=["']([^"']+)["']/i);

    if (m && m[1]) {
      return res.status(200).json({ media_url: unescape(m[1]) });
    }

    // coba JSON-ish fields
    let v = html.match(/"video_url":"([^"]+)"/);
    if (v && v[1]) return res.status(200).json({ media_url: unescape(v[1]) });

    let i = html.match(/"display_url":"([^"]+)"/);
    if (i && i[1]) return res.status(200).json({ media_url: unescape(i[1]) });

    // fallback: window._sharedData
    const marker = "window._sharedData";
    const idx = html.indexOf(marker);
    if (idx !== -1) {
      const start = html.indexOf("{", idx);
      const end = html.indexOf("</script>", start);
      if (start !== -1 && end !== -1) {
        const jsonText = html.slice(start, end).trim();
        try {
          const shared = JSON.parse(jsonText);
          const entry = shared.entry_data || shared.entryData;
          if (entry) {
            const arr = Object.values(entry).flat();
            for (const p of arr) {
              const media =
                p?.[0]?.graphql?.shortcode_media ||
                p?.graphql?.shortcode_media ||
                p;
              if (media) {
                if (media.is_video && media.video_url) {
                  return res.status(200).json({ media_url: media.video_url });
                }
                if (media.display_url) {
                  return res.status(200).json({ media_url: media.display_url });
                }
              }
            }
          }
        } catch (e) {
          // ignore parse error
        }
      }
    }

    return res.status(404).json({ error: "Media tidak ditemukan (mungkin private / struktur berubah)." });
  } catch (err) {
    return res.status(500).json({ error: "Server error", details: String(err) });
  }
}
