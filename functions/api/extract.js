export async function onRequestPost(context) {
  try {
    const { request } = context;
    const body = await request.json().catch(() => ({}));
    const url = (body && body.url) ? String(body.url) : null;

    const jsonResponse = (obj, status = 200) =>
      new Response(JSON.stringify(obj), {
        status,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
      });

    if (!url || !/^https?:\/\/(www\.)?instagram\.com\//i.test(url)) {
      return jsonResponse({ error: "URL tidak valid" }, 400);
    }

    const igResp = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; IGDownloader/1.0)",
        "Accept-Language": "en-US,en;q=0.9"
      }
    });

    if (!igResp.ok) {
      return jsonResponse({ error: `Gagal fetch: ${igResp.status}` }, 502);
    }

    const html = await igResp.text();

    // simple unescape for \u0026 -> &
    const unescapeStr = s => String(s).replace(/\\u0026/g, '&');

    // 1) Try OG meta tags
    const metaMatch =
      html.match(/<meta[^>]*property=["']og:video:secure_url["'][^>]*content=["']([^"']+)["']/i) ||
      html.match(/<meta[^>]*property=["']og:video["'][^>]*content=["']([^"']+)["']/i) ||
      html.match(/<meta[^>]*property=["']og:image:secure_url["'][^>]*content=["']([^"']+)["']/i) ||
      html.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i);

    if (metaMatch && metaMatch[1]) {
      return jsonResponse({ media_url: unescapeStr(metaMatch[1]) });
    }

    // 2) Try embedded JSON snippets for video or image
    const videoMatch = html.match(/"video_url":"([^"]+)"/);
    if (videoMatch && videoMatch[1]) {
      return jsonResponse({ media_url: unescapeStr(videoMatch[1]) });
    }

    const displayMatch = html.match(/"display_url":"([^"]+)"/);
    if (displayMatch && displayMatch[1]) {
      return jsonResponse({ media_url: unescapeStr(displayMatch[1]) });
    }

    // 3) Fallback: try to locate window._sharedData manually (avoid complex regex)
    const marker = 'window._sharedData';
    const idx = html.indexOf(marker);
    if (idx !== -1) {
      // find the first "{" after marker and the following closing "</script>"
      const startBrace = html.indexOf('{', idx);
      const endScript = html.indexOf('</script>', startBrace);
      if (startBrace !== -1 && endScript !== -1) {
        const jsonText = html.slice(startBrace, endScript).trim();
        try {
          const shared = JSON.parse(jsonText);
          const entryData = shared.entry_data || shared.entryData;
          if (entryData) {
            const arr = Object.values(entryData).flat();
            for (const p of arr) {
              const media =
                p?.[0]?.graphql?.shortcode_media ||
                p?.graphql?.shortcode_media ||
                p;
              if (media) {
                if (media.is_video && media.video_url) {
                  return jsonResponse({ media_url: media.video_url });
                }
                if (media.display_url) {
                  return jsonResponse({ media_url: media.display_url });
                }
              }
            }
          }
        } catch (e) {
          // ignore parse errors, we'll continue to final not-found response
        }
      }
    }

    return jsonResponse({ error: "Media tidak ditemukan (mungkin private atau format berubah)." }, 404);

  } catch (err) {
    return new Response(JSON.stringify({ error: "Server error", details: String(err) }), {
      status: 500,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
    });
  }
}
