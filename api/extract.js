// api/extract.js (Node / Vercel Serverless)
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { url } = req.body || {};
    if (!url || !/^https?:\/\/(www\.)?instagram\.com\//i.test(url)) {
      return res.status(400).json({ error: 'URL tidak valid' });
    }

    const RAPIDAPI_HOST = process.env.RAPIDAPI_HOST;
    const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY;
    if (!RAPIDAPI_HOST || !RAPIDAPI_KEY) {
      return res.status(500).json({ error: 'Server not configured (missing RAPIDAPI keys)' });
    }

    // sesuaikan path endpoint kalau API yang kamu pilih berbeda
    const endpoint = `https://${RAPIDAPI_HOST}/instagram`; // contoh, ganti sesuai docs
    const params = new URLSearchParams({ url });

    const r = await fetch(`${endpoint}?${params.toString()}`, {
      method: 'GET',
      headers: {
        'X-RapidAPI-Key': 4e01fd02f0msh6ef168811796f25p1dd6b2jsn789f2b0853a8,
        'X-RapidAPI-Host': instagram-downloader-scraper-reels-igtv-posts-stories.p.rapidapi.com,
        'Accept': 'application/json'
      },
      // jika API butuh content-type / auth tambahan, tambahkan di sini
    });

    const text = await r.text();
    // coba parse json, kalau gagal kirim snippet untuk debugging
    try {
      const data = JSON.parse(text);
      // normalisasi: cari media_url / files / video_url dst
      if (data.media || data.video || data.image || data.url) {
        return res.status(200).json({ ok: true, data });
      }
      // kalau API mengembalikan html/snippet (challenge), kirim info
      return res.status(200).json({ ok: false, message: 'No media found', raw: data });
    } catch (e) {
      // kemungkinan API kembalikan HTML (challenge / blocked)
      return res.status(502).json({ error: 'Invalid JSON from RapidAPI', snippet: text.slice(0, 2000) });
    }

  } catch (err) {
    return res.status(500).json({ error: 'Server error', details: String(err) });
  }
}
