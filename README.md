How to deploy (Vercel):
- Create a new Git repo with files:
  - pages/api/extract.js (server)
  - public/index.html (or put index.html at root and configure)
  - public/script.js
- Or use Next.js pages: place index page at pages/index.js. For simplicity you can serve index.html from public.
- Deploy to Vercel. API route will be /api/extract.

Important:
- This scrapes Instagram HTML. Instagram may block requests from serverless or return guarded HTML. If you see "NO_MEDIA" or snippet shows IG's HTML, try:
  - Run the server on a VM with a stable IP (rotate)
  - Add more headers/cookies (requires reverse-engineering)
  - Use a third-party public proxy (like r.jina.ai fallback used), but reliability varies.
- DON'T publish your RapidAPI key (we avoided it).

If you want me to:
- adapt this to Express (server.js) instead of Next.js
- or produce a full repo ready-to-deploy (I can output a full zip-like file content)
tell me which one and I'll generate the files.

Caveat: using public sites' internal APIs (snapsave/snapinsta) may require reading their network calls (they sometimes call hidden endpoints). If you want me to attempt to call SnapSave specifically, I can try to detect their JSON endpoint (but I need to check live network calls).
