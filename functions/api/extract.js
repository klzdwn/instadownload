export async function onRequestPost(context) {
  try {
    const { request } = context;
    const body = await request.json().catch(()=>({}));
    const url = (body && body.url) ? String(body.url) : null;

    if (!url || !/^https?:\/\/(www\.)?instagram\.com\//i.test(url)) {
      return new Response(JSON.stringify({ error: "URL tidak valid" }), { status: 400, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin":"*" }});
    }

    const igResp = await fetch(url, {
      headers: { "User-Agent":"Mozilla/5.0 (compatible; IGDownloader/1.0)", "Accept-Language":"en-US,en;q=0.9" }
    });
    if (!igResp.ok) return new Response(JSON.stringify({ error: `Gagal fetch: ${igResp.status}` }), { status: 502, headers: { "Content-Type":"application/json", "Access-Control-Allow-Origin":"*" }});
    const html = await igResp.text();
    const unescapeStr = s => s.replace(/\\u0026/g, '&');

    let m = html.match(/<meta[^>]*property=["']og:video:secure_url["'][^>]*content=["']([^"']+)["']/i)
         || html.match(/<meta[^>]*property=["']og:video["'][^>]*content=["']([^"']+)["']/i)
         || html.match(/<meta[^>]*property=["']og:image:secure_url["'][^>]*content=["']([^"']+)["']/i)
         || html.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i);

    if (m && m[1]) return new Response(JSON.stringify({ media_url: unescapeStr(m[1]) }), { headers: { "Content-Type":"application/json", "Access-Control-Allow-Origin":"*" }});

    let v = html.match(/"video_url":"([^"]+)"/);
    if (v && v[1]) return new Response(JSON.stringify({ media_url: unescapeStr(v[1]) }), { headers: { "Content-Type":"application/json", "Access-Control-Allow-Origin":"*" } });

    let i = html.match(/"display_url":"([^"]+)"/);
    if (i && i[1]) return new Response(JSON.stringify({ media_url: unescapeStr(i[1]) }), { headers: { "Content-Type":"application/json", "Access-Control-Allow-Origin":"*" } });

    const sharedMatch = html.match(/window\\._sharedData\\s*=\\s*(\\{.+?\\});\\s*<\\/script>/s);
    if (sharedMatch && sharedMatch[1]) {
      try {
        const shared = JSON.parse(sharedMatch[1]);
        const entryData = shared.entry_data || shared.entryData;
        if (entryData) {
          const arr = Object.values(entryData).flat();
          for (const p of arr) {
            const media = p?.[0]?.graphql?.shortcode_media || p?.graphql?.shortcode_media || p;
            if (media) {
              if (media.is_video && media.video_url) return new Response(JSON.stringify({ media_url: media.video_url }), { headers: { "Content-Type":"application/json", "Access-Control-Allow-Origin":"*" }});
              if (media.display_url) return new Response(JSON.stringify({ media_url: media.display_url }), { headers: { "Content-Type":"application/json", "Access-Control-Allow-Origin":"*" }});
            }
          }
        }
      } catch(e){}
    }

    return new Response(JSON.stringify({ error: "Media tidak ditemukan (mungkin private atau format berubah)." }), { status: 404, headers: { "Content-Type":"application/json", "Access-Control-Allow-Origin":"*" }});

  } catch (err) {
    return new Response(JSON.stringify({ error: "Server error", details: String(err) }), { status: 500, headers: { "Content-Type":"application/json", "Access-Control-Allow-Origin":"*" }});
  }
}
