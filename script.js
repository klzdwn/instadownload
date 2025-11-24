// minimal frontend to call /api/extract and show results
const el = id => document.getElementById(id);
const resultArea = el('resultArea');

function showMsg(text, type='err') {
  resultArea.innerHTML = `<div class="msg ${type==='err' ? 'err' : 'ok'}">${text}</div>`;
}

function clearResult() { resultArea.innerHTML = ''; }

async function onFetch() {
  clearResult();
  const url = el('igUrl').value.trim();
  if (!url) return showMsg('Masukkan URL Instagram dulu.', 'err');

  showMsg('Mencari media…', 'ok');

  try {
    const res = await fetch('/api/extract', {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ url })
    });

    const text = await res.text();
    let json;
    try { json = JSON.parse(text); } catch (e) {
      // show raw
      clearResult();
      return showMsg('Upstream tidak mengembalikan JSON. Lihat console.', 'err');
    }

    clearResult();

    if (res.status >= 400 || json.error || json.status === 'NO_MEDIA') {
      const msg = json.error || json.detail || json.message || 'Tidak ada media';
      const snippet = json.snippet ? `<pre style="max-height:180px;overflow:auto;margin-top:8px;background:#08121b;padding:8px;border-radius:6px;color:#cce">Snippet:\n${json.snippet.slice(0,1500)}</pre>` : '';
      resultArea.innerHTML = `<div class="msg err">${msg}</div>${snippet}`;
      return;
    }

    // expected: { status:200, data: [ {media, thumb, isVideo} ] }
    const items = Array.isArray(json.data) ? json.data : (json.data && json.data.data) ? json.data.data : [];
    if (!items.length) {
      showMsg('Parsed JSON but no media found. Cek debug snippet di atas.', 'err');
      return;
    }

    items.forEach(it => {
      const mediaUrl = it.media || it.url || '';
      const thumb = it.thumb || it.thumbnail || '';
      const isVideo = !!it.isVideo;

      const div = document.createElement('div');
      div.className = 'media';
      div.innerHTML = `
        <div class="thumb">${thumb ? `<img src="${thumb}" style="width:100%;height:100%;object-fit:cover" onerror="this.replaceWith(document.createTextNode('no thumb'))">` : 'no thumb'}</div>
        <div style="flex:1;min-width:0">
          <div style="font-weight:700;color:#e6eef8">Media</div>
          <div style="font-size:13px;color:#cbd5e1;margin:6px 0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${isVideo ? 'video' : 'image'} • ${mediaUrl}</div>
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            <button class="btnPreview" style="padding:8px 10px;border-radius:8px;background:#0b1320;color:#fff;border:none;cursor:pointer">Preview</button>
            <a class="btnDownload btn" href="${mediaUrl}" ${mediaUrl && mediaUrl.startsWith(window.location.origin) ? 'download' : 'target="_blank"'}>Download</a>
            <a class="btn" href="${mediaUrl}" target="_blank" style="background:transparent;color:#63b3ed;border:1px solid rgba(255,255,255,0.06);">Open link</a>
          </div>
        </div>
      `;
      resultArea.appendChild(div);

      // preview
      const previewBtn = div.querySelector('.btnPreview');
      previewBtn.addEventListener('click', () => {
        if (!mediaUrl) return alert('No media URL');
        const overlay = document.createElement('div');
        overlay.style = 'position:fixed;inset:0;background:rgba(0,0,0,0.85);display:flex;align-items:center;justify-content:center;z-index:99999;padding:20px;';
        const box = document.createElement('div');
        box.style = 'max-width:100%;max-height:100%;overflow:auto;';
        if (isVideo || /\.mp4|video/.test(mediaUrl)) {
          const v = document.createElement('video');
          v.controls = true; v.src = mediaUrl; v.autoplay = true; v.style = 'max-width:100%;max-height:80vh;border-radius:8px';
          box.appendChild(v);
        } else {
          const im = document.createElement('img');
          im.src = mediaUrl; im.style = 'max-width:100%;max-height:80vh;border-radius:8px';
          box.appendChild(im);
        }
        const close = document.createElement('button');
        close.textContent = 'Close'; close.style = 'display:block;margin-top:12px;padding:8px 12px;border-radius:8px;background:#E53E3E;color:#fff;border:none;cursor:pointer';
        close.onclick = () => document.body.removeChild(overlay);
        box.appendChild(close);
        overlay.appendChild(box); document.body.appendChild(overlay);
      });
    });

  } catch (err) {
    clearResult();
    showMsg('Gagal request ke backend: ' + (err.message || err), 'err');
    console.error(err);
  }
}

document.getElementById('btnFetch').addEventListener('click', onFetch);
document.getElementById('btnClear').addEventListener('click', () => {
  document.getElementById('igUrl').value = '';
  clearResult();
});
