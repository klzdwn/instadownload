export async function onRequestPost({ request }) {
  try {
    const { url } = await request.json().catch(() => ({}));

    if (!url || !/^https?:\/\/(www\.)?instagram\.com\//i.test(url)) {
      return new Response(JSON.stringify({ error: "URL tidak valid" }), {
        status: 400,
        headers: h()
      });
    }

    // IG BLOCK fix: pakai 'no-cache' + mobile UA + referer
    const ig = await fetch(url, {
      method: "GET",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Linux; Android 10) Mobile Safari/537.36 Instagram 254.0.0.19.109",
        "Accept-Language": "en-US,en;q=0.9",
        "Referer": "https://www.instagram.com/",
        "Cache-Control": "no-cache"
      }
    });

    if (ig.status === 429) {
      return new Response(JSON.stringify({ error: "Instagram rate limit (429)" }), {
        status: 429,
        headers: h()
      });
    }

    const html = await ig.text();
    const decode = s => s.replace(/\\u0026/g, "&");

    // VIDEO
    let m =
      html.match(/"video_url":"([^"]+)"/) ||
      html.match(/property="og:video" content="([^"]+)"/);

    if (m && m[1]) {
      return new Response(JSON.stringify({ media_url: decode(m[1]) }), {
        status: 200,
        headers: h()
      });
    }

    // IMAGE
    let i =
      html.match(/"display_url":"([^"]+)"/) ||
      html.match(/property="og:image" content="([^"]+)"/);

    if (i && i[1]) {
      return new Response(JSON.stringify({ media_url: decode(i[1]) }), {
        status: 200,
        headers: h()
      });
    }

    return new Response(
      JSON.stringify({
        error: "Media tidak ditemukan (mungkin private/IG ubah struktur)"
      }),
      { status: 404, headers: h() }
    );
  } catch (e) {
    return new Response(JSON.stringify({ error: "Server error", msg: String(e) }), {
      status: 500,
      headers: h()
    });
  }
}

function h() {
  return {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*"
  };
}
