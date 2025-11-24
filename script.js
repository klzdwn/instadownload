document.getElementById("btnFetch").addEventListener("click", async () => {
    const url = document.getElementById("igUrl").value.trim();
    const resultBox = document.getElementById("result");
    resultBox.innerHTML = "Fetching data...";

    if (!url) {
        resultBox.innerHTML = "Please paste an Instagram URL.";
        return;
    }

    try {
        const api = `/api/snap?url=${encodeURIComponent(url)}`;
const res = await fetch(api);
        const res = await fetch(api);
        const html = await res.text();

        // Snapinsta returns direct download links inside HTML → extract with regex
        const regex = /https:\/\/[^"]+\.(mp4|jpg|jpeg|png)/g;
        const matches = html.match(regex);

        if (!matches || matches.length === 0) {
            resultBox.innerHTML = "<b>No media found.</b>";
            return;
        }

        resultBox.innerHTML = "";

        matches.forEach((media, i) => {
            const isVideo = media.includes(".mp4");

            const card = document.createElement("div");
            card.className = "card";

            card.innerHTML = `
                <h3>Media #${i + 1} (${isVideo ? "Video" : "Image"})</h3>
                
                ${isVideo 
                    ? `<video class="media-img" controls src="${media}"></video>`
                    : `<img class="media-img" src="${media}" />`
                }

                <a class="download-btn" href="${media}" download>
                    Download
                </a>
            `;

            resultBox.appendChild(card);
        });

    } catch (err) {
        resultBox.innerHTML = "Error: " + err;
    }
});
