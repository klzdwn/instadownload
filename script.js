document.getElementById("btnDownload").onclick = async () => {
  const url = document.getElementById("igUrl").value.trim();
  const box = document.getElementById("result");

  if (!url) {
    box.innerHTML = "Masukkan URL!";
    return;
  }

  box.innerHTML = "Mengambil data...";

  try {
    const res = await fetch("/api/extract", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url })
    });

    const json = await res.json();
    console.log(json);

    if (!json.data) {
      box.innerHTML = "Tidak ada media ditemukan.";
      return;
    }

    box.innerHTML = "";

    json.data.forEach((m, i) => {
      box.innerHTML += `
        <div>
          <p>Media #${i + 1}</p>
          ${m.isVideo 
            ? `<video src="${m.media}" controls width="300"></video>`
            : `<img src="${m.media}" width="300">`
          }
          <br>
          <a href="${m.media}" download>
            <button>Download</button>
          </a>
        </div>
      `;
    });

  } catch (err) {
    box.innerHTML = "Error: " + err;
  }
};
