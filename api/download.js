// api/download.js
// Proxy download endpoint — streams remote media and forces download
// Be careful: this consumes server bandwidth.

export default async function handler(req, res) {
  try {
    const url = req.query.url || (req.body && req.body.url);
    if (!url) {
      res.status(400).json({ error: 'Missing url param' });
      return;
    }

    let parsed;
    try {
      parsed = new URL(url);
    } catch (e) {
      res.status(400).json({ error: 'Invalid url' });
      return;
    }

    const resp = await fetch(parsed.toString(), {
      headers: { 'User-Agent': req.headers['user-agent'] || 'Mozilla/5.0 (compatible)' },
      redirect: 'follow'
    });

    if (!resp.ok) {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.status(502).json({ error: 'Upstream fetch failed', status: resp.status });
      return;
    }

    const contentType = resp.headers.get('content-type') || 'application/octet-stream';
    // infer filename
    const pathname = parsed.pathname || '';
    const fallbackName = 'media';
    const filename = pathname.split('/').pop() || fallbackName;

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Access-Control-Allow-Origin', '*');

    // stream bytes
    const buffer = await resp.arrayBuffer();
    res.status(200).send(Buffer.from(buffer));
  } catch (err) {
    console.error('download error', err);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.status(500).json({ error: 'Server error', detail: err.message || String(err) });
  }
}
