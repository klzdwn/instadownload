export async function onRequestPost(context) {
  try {
    const { request } = context;
    const body = await request.json().catch(()=>({}));
    const url = (body && body.url) ? String(body.url) : null;

    if (!url || !/^https?:\/\/(www\.)?instagram\.com\//i.test(url)) {
      return new Response(JSON.stringify({ error: "URL tidak valid" }), { status: 400, headers: { "Content-Type": "application/json" }});
    }

    // Fetch Instagram page server-side
    const igResp = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; IGDownloader/1.0)",
        "Accept-Language": "en-US,en;q=0.9"
      }
    });

    if (!igResp.ok) {
      return new Response(JSON.stringify({ error: `Gagal fetch: ${igResp.status}` }), { status: 502, headers: { "Content-Type": "application/json" }});
    }

    const html = await igResp.text();

    // Helper to unescape unicode escape sequences
    const unescapeStr = s => s.replace(/\\u0026/g, '&').replace(/\\u00([\da-fA-F]{2})/g, (_,g)=>String.fromCharCode(parseInt(g,16)));

    // 1) Try meta og:video and og:image
    let m = html.match(/<meta[^>]*property=["']og:video:secure_url["'][^>]*content=["']([^"']+)["']/i)
         || html.match(/<meta[^>]*property=["']og:video["'][^>]*content=["']([^"']+)["']/i)
         || html.match(/<meta[^>]*property=["']og:image:secure_url["'][^>]*content=["']([^"']+)["']/i)
         || html.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i);

    if (m && m[1]) {
      const found = unescapeStr(m[1]);
      return new Response(JSON.stringify({ media_url: found }), { status: 200, headers: { "Content-Type": "application/json" }});
    }

    // 2) Try JSON inside page: "video_url":"..."; "display_url":"..."
    let v = html.match(/"video_url":"([^"]+)"/);
    if (v && v[1]) {
      const videoUrl = unescapeStr(v[1]);
      return new Response(JSON.stringify({ media_url: videoUrl }), { status: 200, headers: { "Content-Type": "application/json" }});
    }

    let i = html.match(/"display_url":"([^"]+)"/);
    if (i && i[1]) {
      const imageUrl = unescapeStr(i[1]);
      return new Response(JSON.stringify({ media_url: imageUrl }), { status: 200, headers: { "Content-Type": "application/json" }});
    }

    // 3) Try window._sharedData (older pages) -> find graphql.shortcode_media
    const sharedMatch = html.match(/window\._sharedData\s*=\s*(\{.+?\});\s*<\/script>/s);
    if (sharedMatch && sharedMatch[1]) {
      try {
        const shared = JSON.parse(sharedMatch[1]);
        const entryData = shared.entry_data || shared.entryData;
        if (entryData) {
          const arr = Object.values(entryData).flat();
          for (const p of arr) {
            const media = p?.[0]?.graphql?.shortcode_media || p?.graphql?.shortcode_media || p;
            if (media) {
              if (media.is_video && media.video_url) return new Response(JSON.stringify({ media_url: media.video_url }), { headers: { "Content-Type": "application/json" }});
              if (media.display_url) return new Response(JSON.stringify({ media_url: media.display_url }), { headers: { "Content-Type": "application/json" }});
            }
          }
        }
      } catch(e) {
        // ignore parse errors
      }
    }

    // Not found
    return new Response(JSON.stringify({ error: "Media tidak ditemukan. Mungkin akun privat atau format berubah." }), { status: 404, headers: { "Content-Type": "application/json" }});

  } catch (err) {
    return new Response(JSON.stringify({ error: "Server error", details: String(err) }), { status: 500, headers: { "Content-Type": "application/json" }});
  }
}
