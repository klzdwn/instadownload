(function(){
  const urlInput = document.getElementById('url');
  const btnDownload = document.getElementById('btnDownload');
  const btnClear = document.getElementById('btnClear');
  const status = document.getElementById('status');
  const fab = document.getElementById('fab');

  function setStatus(html){ status.innerHTML = html }
  function setLoading(is){
    btnDownload.disabled = is;
    btnDownload.textContent = is ? 'Mencari...' : 'Download';
  }
  function escapeHtml(s){
    return String(s).replace(/[&<>\"']/g, c => ({
      '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
    }[c]));
  }

  btnClear.addEventListener('click', () => {
    urlInput.value = '';
    setStatus('');
  });

  btnDownload.addEventListener('click', async () => {
    const url = urlInput.value.trim();
    if(!url){
      setStatus('<div style="color:#ffd2a8">Masukkan link Instagram dulu.</div>');
      return;
    }

    if(!/^https?:\/\/(www\.)?instagram\.com\/.+/i.test(url)){
      setStatus('<div style="color:#ffb4b4">URL bukan link Instagram.</div>');
      return;
    }

    setLoading(true);
    setStatus('<div style="color:#ccc">Mengambil media...</div>');

    try{
      const resp = await fetch('/api/extract', {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({url})
      });

      const data = await resp.json();
      if(!resp.ok) throw new Error(data.error || 'Server error');

      const media = data.media_url;
      if(!media) throw new Error('Tidak ada media ditemukan');

      const isVideo = /\.(mp4|webm|m3u8)/i.test(media) || /video/.test(media);
      const safe = escapeHtml(media);

      const html = `
        <div class="card-preview">
          <div class="meta">
            <div class="chip">${isVideo ? 'Video' : 'Gambar'}</div>
          </div>
          ${
            isVideo
              ? `<video class="preview-media" controls src="${safe}"></video>`
              : `<img class="preview-media" src="${safe}">`
          }
          <div class="links">
            <a class="open" href="${safe}" target="_blank">Buka</a>
            <a class="direct" href="${safe}" download>Download</a>
          </div>
        </div>
      `;

      setStatus(html);

    }catch(err){
      setStatus('<div style="color:#ff7a7a">' + escapeHtml(err.message) + '</div>');
    }

    setLoading(false);
  });

  fab.addEventListener('click', (e)=>{
    e.preventDefault();
    alert("Butuh bantuan deploy / backend IG extractor? Chat saya.");
  });
})();
