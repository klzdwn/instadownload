// api/thumb.js
// Proxy thumbnails/images to avoid hotlink/CORS issues.
// Streams the remote image and returns it with appropriate content-type.

export default async function handler(req, res) {
  try {
    const url = req.query.url || (req.body && req.body.url);
    if (!url) {
      res.status(400).json({ error: 'Missing url param' });
      return;
    }

    // basic validation
    let parsed;
    try {
      parsed = new URL(url);
    } catch (e) {
      res.status(400).json({ error: 'Invalid url' });
      return;
    }

    // fetch image
    const resp = await fetch(parsed.toString(), {
      headers: { 'User-Agent': req.headers['user-agent'] || 'Mozilla/5.0 (compatible)' },
      redirect: 'follow'
    });

    if (!resp.ok) {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.status(502).json({ error: 'Upstream fetch failed', status: resp.status });
      return;
    }

    // copy content-type and stream body
    const contentType = resp.headers.get('content-type') || 'application/octet-stream';
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=3600'); // cache thumbs for 1 hour
    res.setHeader('Access-Control-Allow-Origin', '*');

    // stream body
    const reader = resp.body.getReader();
    const encoder = new TextEncoder();
    // pipe body directly (Node/Vercel supports streaming)
    const stream = new ReadableStream({
      start(controller) {
        function push() {
          reader.read().then(({ done, value }) => {
            if (done) {
              controller.close();
              return;
            }
            controller.enqueue(value);
            push();
          }).catch(err => {
            console.error('stream error', err);
            controller.error(err);
          });
        }
        push();
      }
    });

    const response = new Response(stream, { headers: { 'Content-Type': contentType } });
    // In Vercel / Edge runtime you can return Response; but in serverless Node we pipe manually:
    const buffer = await resp.arrayBuffer();
    res.status(200).send(Buffer.from(buffer));
  } catch (err) {
    console.error('thumb error', err);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.status(500).json({ error: 'Server error', detail: err.message || String(err) });
  }
}
