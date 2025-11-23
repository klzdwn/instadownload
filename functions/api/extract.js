export async function onRequestPost(context) {
  try {
    const { request } = context;
    const body = await request.json().catch(() => ({}));
    const url = (body && body.url) ? String(body.url) : null;

    const jsonResponse = (obj, status = 200) =>
      new Response(JSON.stringify(obj), {
        status,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*"
        }
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
    const unescapeStr = s => String(s).replace(/\\u0026/g, '&');

    // 1) OG meta
    const metaMatch =
      html.match(/property=["']og:video:secure_url["'][^>]*content=["']([^"']+)/i) ||
      html.match(/property=["']og:video["'][^>]*content=["']([^"']+)/i) ||
      html.match(/property=["']og:image:secure_url["'][^>]*content=["']([^"']+)/i) ||
      html.match(/property=["']og:image["'][^>]*content=["']([^"']+)/i);

    if (metaMatch && metaMatch[1]) {
      return jsonResponse({ media_url: unescapeStr(metaMatch[1]) });
    }

    // 2) JSON-ish fields
    const videoMatch = html.match(/"video_url":"([^"]+)"/);
    if (videoMatch && videoMatch[1]) {
      return jsonResponse({ media_url: unescapeStr(videoMatch[1]) });
    }

    const displayMatch = html.match(/"display_url":"([^"]+)"/);
    if (displayMatch && displayMatch[1]) {
      return jsonResponse({ media_url: unescapeStr(displayMatch[1]) });
    }

    // 3) window._sharedData fallback
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
                  return jsonResponse({ media_url: media.video_url });
                }
                if (media.display_url) {
                  return jsonResponse({ media_url: media.display_url });
                }
              }
            }
          }
        } catch (e) {}
      }
    }

    return jsonResponse(
      { error: "Media tidak ditemukan (mungkin private / tidak public)." },
      404
    );

  } catch (err) {
    return new Response(
      JSON.stringify({ error: "Server error", details: String(err) }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*"
        }
      }
    );
  }
}
