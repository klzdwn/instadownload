export default async function handler(req, res) {
  try {
    const { url } = req.query;
    if (!url) return res.status(400).json({ error: "Missing ?url=" });

    const target = "https://snapinsta.app/action.php";

    const body = new URLSearchParams();
    body.append("url", url);
    body.append("action", "post");

    const r = await fetch(target, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
      body,
    });

    const html = await r.text();

    res.setHeader("Content-Type", "text/html; charset=utf-8");
    return res.status(200).send(html);
  } catch (err) {
    return res.status(500).json({ error: true, detail: err.toString() });
  }
}
