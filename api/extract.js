// script.js - frontend
const elUrl = document.getElementById('url');
const btn = document.getElementById('go');
const clearBtn = document.getElementById('clear');
const statusEl = document.getElementById('status');
const errEl = document.getElementById('error');
const resultsEl = document.getElementById('results');
const snippetEl = document.getElementById('snippet');

function showStatus(msg=''){ statusEl.style.display = msg ? 'block' : 'none'; statusEl.textContent = msg; }
function showError(msg=''){ errEl.style.display = msg ? 'block' : 'none'; errEl.textContent = msg; }
function showSnippet(txt){ snippetEl.style.display = txt ? 'block' : 'none'; snippetEl.textContent = txt || ''; }
function showResults(html){ resultsEl.style.display = html ? 'block' : 'none'; resultsEl.innerHTML = html || ''; }

clearBtn.addEventListener('click', () => {
  elUrl.value = '';
  showResults('');
  showError('');
  showStatus('');
  showSnippet('');
});

btn.addEventListener('click', async () => {
  showError(''); showSnippet(''); showResults('');
  const url = elUrl.value.trim();
  if (!url) { showError('Masukkan URL Instagram terlebih dahulu'); return; }
  showStatus('Memproses...');

  try {
    const res = await fetch('/api/extract', {
      method: 'POST',
      headers: { 'Content-Type':'application/json' },
      body: JSON.stringify({ url })
    });

    const text = await res.text(); // ambil text dulu
    let json;
    try { json = JSON.parse(text); } catch(e) {
      // non-json dari backend -> tampilkan snippet untuk debug
      showStatus('');
      showError('Upstream tidak mengembalikan JSON. Cek snippet di bawah.');
      showSnippet(text.slice(0, 4000));
      return;
    }

    if (!res.ok) {
      showStatus('');
      const msg = json.error || json.message || `Server error (${res.status})`;
      showError(msg);
      if (json.snippet) showSnippet(json.snippet);
      return;
    }

    showStatus('Sukses — lihat hasil di bawah');
    showError('');

    // format result: sesuaikan struktur yang dikembalikan server
    // expected: { status: 200, data: { data: [ { thumb, media, isVideo } ] } }
    const payload = json.data || json;
    const items = (payload.data && payload.data.data) || (payload.data) || [];

    if (!items || items.length === 0) {
      showResults('<div class="meta">Tidak ada media ditemukan.</div>');
      return;
    }

    // buat cards
    let out = '';
    items.forEach((it, idx) => {
      const thumb = it.thumb || it.thumbnail || '';
      const media = it.media || it.url || it.src || '';
      const isVideo = !!it.isVideo || !!it.is_video || (media && media.endsWith('.mp4'));
      out += `
        <div class="media-card">
          <img class="thumb" src="${thumb || ''}" alt="thumb ${idx+1}" onerror="this.style.display='none'"/>
          <div class="meta">
            <div><strong>Media #${idx+1}</strong></div>
            <div class="meta">${isVideo ? 'video' : 'image'} • <small style="word-break:break-all">${media}</small></div>
            <div class="btns">
              ${isVideo ? `<button onclick="window.open('${media}','_blank')">Preview</button>` : `<a href="${media}" target="_blank" rel="noopener">Open</a>`}
              <a href="${media}" download>Download</a>
              <a href="${media}" target="_blank" rel="noopener">Open link</a>
            </div>
          </div>
        </div>
        <hr style="border:none;margin:12px 0;border-top:1px solid rgba(255,255,255,0.04)"/>
      `;
    });

    showResults(out);

  } catch (err) {
    showStatus('');
    showError('Gagal menghubungi server: ' + (err.message || err));
  }
});
