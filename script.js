document.getElementById("btnFetch").onclick = fetchMedia;
document.getElementById("btnClear").onclick = () => {
  document.getElementById("url").value = "";
  document.getElementById("results").innerHTML = "";
};

async function fetchMedia() {
  const url = document.getElementById("url").value.trim();
  const box = document.getElementById("results");

  if (!url) {
    box.innerHTML = "<p>Masukkan URL dulu</p>";
    return;
  }

  box.innerHTML = "<p>Mengambil media...</p>";

  const res = await fetch("/api/extract", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url })
  });

  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    box.innerHTML = "<p>Response bukan JSON</p>";
    return;
  }

  if (!json.data) {
    box.innerHTML = "<p>Tidak menemukan media</p>";
    return;
  }

  box.innerHTML = "";

  json.data.forEach(item => {
    const card = document.createElement("div");
    card.className = "card";

    const thumb = document.createElement("img");
    thumb.className = "thumb";
    thumb.src = item.thumb ? `/api/thumb?url=${encodeURIComponent(item.thumb)}` : "/noimg.png";

    const info = document.createElement("div");
    info.innerHTML = `
      <p>${item.isVideo ? "Video" : "Foto"}</p>
      <div class="btns">
        <a href="${item.media}" target="_blank">Open</a>
        <a href="${item.media}" download>Download</a>
      </div>
    `;

    card.appendChild(thumb);
    card.appendChild(info);
    box.appendChild(card);
  });
}
