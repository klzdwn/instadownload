// script.js
const el = id => document.getElementById(id);
const btn = el('btnFetch');
const clear = el('btnClear');
const input = el('url');
const status = el('status');
const results = el('results');
const debug = el('debug');

function setStatus(s, isError = false) {
  status.textContent = s || '';
  status.style.color = isError ? 'salmon' : '';
}

function makeMediaCard(item, idx) {
  // item: expects { thumb, media, isVideo, maybe type/width/height }
  const wrap = document.createElement('div');
  wrap.className = 'media-card';
  const img = document.createElement('img');
  img.className = 'media-thumb';
  img.alt = `thumb-${idx}`;
  img.src = item.thumb || '';
  // fallback to proxy image if blocked
  img.onerror = () => {
    if (item.thumb) {
      img.src = '/api/proxy-image?url=' + encodeURIComponent(item.thumb);
    } else {
      img.style.display = 'none';
    }
  };

  const info = document.createElement('div');
  info.className = 'media-info';
  const title = document.createElement('div');
  title.style.color = '#fff';
  title.textContent = `Media #${idx+1}`;
  const meta = document.createElement('div');
  meta.textContent = (item.isVideo ? 'video' : 'image') + ' • ' + (item.media || '');
  meta.style.wordBreak = 'break-all';
  meta.style.fontSize = '13px';
  meta.style.marginTop = '6px';

  const actions = document.createElement('div');
  actions.className = 'media-actions';

  const previewBtn = document.createElement('button');
  previewBtn.className = 'small-btn';
  previewBtn.textContent = 'Preview';
  previewBtn.onclick = () => window.open(item.media, '_blank');

  const downloadBtn = document.createElement('a');
  downloadBtn.className = 'small-btn';
  downloadBtn.textContent = 'Download';
  downloadBtn.href = item.media || '#';
  downloadBtn.setAttribute('download', '');
  downloadBtn.target = '_blank';
  downloadBtn.rel = 'noopener';

  const openLink = document.createElement('a');
  openLink.href = item.media || '#';
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
  debug.style.display = 'none';
  debug.textContent = '';
  results.innerHTML = '';
  try {
    const res = await fetch('/api/extract', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url })
    });

    const txt = await res.text();
    let json;
    try { json = JSON.parse(txt); } catch(e) { json = null; }

    if (!json) {
      setStatus('Upstream tidak mengembalikan JSON. Cek debug.', true);
      debug.style.display = 'block';
      debug.textContent = txt.slice(0, 4000);
      return;
    }

    if (res.status >= 400) {
      setStatus(json.error || 'Error dari backend', true);
      debug.style.display = 'block';
      debug.textContent = JSON.stringify(json, null, 2);
      return;
    }

    // response shape: { status: 200, data: { data: [{thumb, media, isVideo}, ...] } }
    const payload = json.data || json;
    // try to locate common structures
    const items = (payload.data && Array.isArray(payload.data)) ? payload.data : (payload.media && Array.isArray(payload.media) ? payload.media : null);

    if (!items) {
      setStatus('Tidak ada media ditemukan', true);
      debug.style.display = 'block';
      debug.textContent = JSON.stringify(json, null, 2);
      return;
    }

    setStatus('Sukses — lihat hasil di bawah', false);

    items.forEach((it, i) => {
      // provider might return media objects or strings
      const item = (typeof it === 'string') ? { media: it, thumb: it } : it;
      const card = makeMediaCard(item, i);
      results.appendChild(card);
    });

  } catch (err) {
    console.error(err);
    setStatus('Gagal memanggil backend: ' + (err.message || err), true);
  }
}

btn.addEventListener('click', () => {
  const url = input.value && input.value.trim();
  if (!url) return setStatus('Masukkan URL Instagram dulu', true);
  callExtract(url);
});
clear.addEventListener('click', () => {
  input.value = '';
  results.innerHTML = '';
  setStatus('');
  debug.style.display = 'none';
});
