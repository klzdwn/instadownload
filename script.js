// script.js - improved UI rendering + robust fetch to /api/extract
(() => {
  const $ = id => document.getElementById(id);

  const btn = $('btnFetch');
  const clearBtn = $('btnClear');
  const input = $('url');
  const statusEl = $('status');
  const results = $('results');
  const debug = $('debug');

  function setStatus(text = '', isError = false) {
    if (!statusEl) return;
    statusEl.textContent = text;
    statusEl.style.color = isError ? 'salmon' : '';
  }

  function showDebug(text) {
    if (!debug) return;
    debug.style.display = text ? 'block' : 'none';
    debug.textContent = text || '';
  }

  function makeMediaCard(item, idx) {
    // normalize item
    const mediaUrl = item.media || item.src || item.url || (typeof item === 'string' ? item : '');
    const thumb = item.thumb || item.thumbnail || mediaUrl;
    const isVideo = item.isVideo || item.type === 'video' || /\.mp4(\?|$)/i.test(mediaUrl);

    // card container
    const wrap = document.createElement('div');
    wrap.className = 'media-card';

    // thumbnail
    const img = document.createElement('img');
    img.className = 'media-thumb';
    img.alt = `thumb-${idx+1}`;
    img.loading = 'lazy';
    img.src = thumb || '';
    img.onerror = () => {
      // fallback to proxy-image endpoint if thumbnail blocked
      if (thumb) {
        img.src = `/api/proxy-image?url=${encodeURIComponent(thumb)}`;
      } else {
        img.style.display = 'none';
      }
    };

    // info column
    const info = document.createElement('div');
    info.className = 'media-info';

    const title = document.createElement('div');
    title.className = 'media-title';
    title.textContent = `Media #${idx+1}`;

    const meta = document.createElement('div');
    meta.className = 'media-meta';
    meta.textContent = `${isVideo ? 'video' : 'image'} • ${mediaUrl}`;
    meta.style.wordBreak = 'break-all';

    // actions
    const actions = document.createElement('div');
    actions.className = 'media-actions';

    const previewBtn = document.createElement('button');
    previewBtn.className = 'small-btn';
    previewBtn.textContent = 'Preview';
    previewBtn.onclick = () => window.open(mediaUrl, '_blank');

    const downloadBtn = document.createElement('a');
    downloadBtn.className = 'small-btn';
    downloadBtn.textContent = 'Download';
    downloadBtn.href = mediaUrl || '#';
    downloadBtn.setAttribute('download', '');
    downloadBtn.target = '_blank';
    downloadBtn.rel = 'noopener';

    const openLink = document.createElement('a');
    openLink.href = mediaUrl || '#';
    openLink.className = 'link';
    openLink.textContent = 'Open link';
    openLink.target = '_blank';
    openLink.rel = 'noopener';

    actions.appendChild(previewBtn);
    actions.appendChild(downloadBtn);
    actions.appendChild(openLink);

    info.appendChild(title);
    info.appendChild(meta);
    info.appendChild(actions);

    wrap.appendChild(img);
    wrap.appendChild(info);

    return wrap;
  }

  async function callExtract(url) {
    setStatus('Mencari media ...');
    showDebug('');
    if (results) results.innerHTML = '';

    try {
      const res = await fetch('/api/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url })
      });

      // read text first — backend sometimes returns HTML for errors
      const txt = await res.text();
      let json = null;
      try { json = JSON.parse(txt); } catch(e) { json = null; }

      if (!json) {
        // non-JSON upstream (HTML/error) => show debug
        setStatus('Upstream tidak mengembalikan JSON. Cek debug.', true);
        showDebug(txt.slice(0, 4000));
        return;
      }

      if (res.status >= 400) {
        // backend error JSON
        const errMsg = json.error || json.message || 'Error dari backend';
        setStatus(errMsg, true);
        showDebug(JSON.stringify(json, null, 2));
        return;
      }

      // payload may be { status:200, data: { data: [...] } } or { data: [...] } etc.
      let payload = json.data !== undefined ? json.data : json;
      let items = null;

      // common shapes:
      // - payload.data -> array
      // - payload.media -> array
      // - payload -> array
      if (Array.isArray(payload)) {
        items = payload;
      } else if (payload && Array.isArray(payload.data)) {
        items = payload.data;
      } else if (payload && Array.isArray(payload.media)) {
        items = payload.media;
      }

      if (!items || items.length === 0) {
        setStatus('Tidak ada media ditemukan', true);
        showDebug(JSON.stringify(json, null, 2));
        return;
      }

      setStatus('Sukses — lihat hasil di bawah', false);

      items.forEach((it, i) => {
        const normalized = (typeof it === 'string') ? { media: it, thumb: it } : it;
        const card = makeMediaCard(normalized, i);
        results.appendChild(card);
      });

      // scroll to results
      results.scrollIntoView({ behavior: 'smooth', block: 'start' });

    } catch (err) {
      console.error('callExtract error', err);
      setStatus('Gagal memanggil backend: ' + (err.message || err), true);
    }
  }

  // event wiring
  if (btn) {
    btn.addEventListener('click', () => {
      const urlVal = input && input.value && input.value.trim();
      if (!urlVal) {
        setStatus('Masukkan URL Instagram dulu', true);
        return;
      }
      callExtract(urlVal);
    });
  }

  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      if (input) input.value = '';
      if (results) results.innerHTML = '';
      setStatus('');
      showDebug('');
    });
  }

  // quick keyboard support (Enter)
  if (input) {
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        btn && btn.click();
      }
    });
  }
})();
