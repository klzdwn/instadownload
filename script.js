async function fetchMedia() {
  const url = document.getElementById("url").value.trim();
  const box = document.getElementById("results");
  box.innerHTML = "Mengambil...";
  try {
    const r = await fetch("/api/extract", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url })
    });
    const txt = await r.text();
    let j;
    try { j = JSON.parse(txt); } catch(e) { box.innerText = "Backend tidak mengembalikan JSON"; return; }

    if (j.status !== 200 || !j.data || !j.data.length) {
      // show debug
      box.innerHTML = `<pre style="color:#f33">Parsed JSON but no media found.\n\nStatus: ${j.status}\n\nDebug: ${JSON.stringify(j.debug || {}, null, 2).slice(0,1000)}</pre>`;
      if (j.snippet) {
        box.innerHTML += `<details><summary>Snippet</summary><pre style="max-height:300px;overflow:auto;background:#111;padding:8px;color:#ddd">${escapeHtml(j.snippet)}</pre></details>`;
      }
      return;
    }

    // render items...
    box.innerHTML = "";
    j.data.forEach(item => {
      const c = document.createElement("div");
      c.className = "card";
      const thumb = document.createElement("img");
      thumb.src = item.thumb ? `/api/thumb?url=${encodeURIComponent(item.thumb)}` : "/noimg.png";
      thumb.className = "thumb";
      const info = document.createElement("div");
      info.innerHTML = `<div>${item.isVideo ? "Video" : "Foto"}</div>
        <div><a href="${item.media}" target="_blank">Open</a> <a href="${item.media}" download>Download</a></div>`;
      c.appendChild(thumb);
      c.appendChild(info);
      box.appendChild(c);
    });

  } catch (err) {
    box.innerText = "Error: " + err;
  }
}

function escapeHtml(s) { return (s+"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;"); }
