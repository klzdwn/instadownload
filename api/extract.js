// script.js (FULL, replace your old script.js with this)
const form = document.getElementById("form");
const urlInput = document.getElementById("urlInput");
const resultBox = document.getElementById("result");
const statusLabel = document.getElementById("statusLabel");
const loading = document.getElementById("loading");

// small helper to create elements
function el(tag, attrs = {}, children = []) {
  const e = document.createElement(tag);
  for (const k in attrs) {
    if (k === "class") e.className = attrs[k];
    else if (k === "text") e.textContent = attrs[k];
    else if (k === "html") e.innerHTML = attrs[k];
    else e.setAttribute(k, attrs[k]);
  }
  children.forEach(c => e.appendChild(c));
  return e;
}

function clearResult() {
  resultBox.innerHTML = "";
}

function showStatus(text, color) {
  statusLabel.textContent = text;
  statusLabel.style.color = color || "#bbb";
}

function showError(text) {
  showStatus(text, "red");
}

// render upstream debugging snippet (collapsible)
function renderSnippet(snippet) {
  const wrap = el("div", { class: "snippet-wrap" });
  const btn = el("button", { class: "snippet-toggle", text: "Show debug snippet" });
  const pre = el("pre", { class: "snippet-pre", text: snippet });
  pre.style.display = "none";
  btn.addEventListener("click", () => {
    const opened = pre.style.display === "block";
    pre.style.display = opened ? "none" : "block";
    btn.textContent = opened ? "Show debug snippet" : "Hide debug snippet";
  });
  wrap.appendChild(btn);
  wrap.appendChild(pre);
  return wrap;
}

// preview media in a new window/tab
function previewMedia(src, isVideo) {
  const w = window.open("", "_blank");
  if (!w) {
    alert("Pop-up blocked. Izinkan pop-up untuk melihat preview.");
    return;
  }
  w.document.body.style.margin = "0";
  if (isVideo) {
    w.document.body.innerHTML = `<video src="${src}" controls autoplay style="width:100vw;height:100vh;object-fit:contain;background:#000"></video>`;
  } else {
    w.document.body.innerHTML = `<img src="${src}" style="width:100vw;height:100vh;object-fit:contain;background:#000" />`;
  }
}

// render a single media card (thumb, preview, download, open)
function renderMediaCard(item, index) {
  const thumb = item.thumb || "";
  const media = item.media || item.url || "";
  const isVideo = !!item.isVideo;

  const img = el("img", { src: thumb, class: "media-thumb", alt: `thumb-${index}` });
  img.onerror = () => { img.src = ""; img.style.display = "none"; };

  const title = el("p", { class: "media-title", text: `Media #${index + 1} — ${isVideo ? "video" : "image"}` });

  const openLink = el("a", { href: media, target: "_blank", class: "btn small", text: "Open link" });
  const previewBtn = el("button", { class: "btn small", text: "Preview" });
  previewBtn.addEventListener("click", () => previewMedia(media, isVideo));

  const downloadA = el("a", {
    href: media,
    download: `ig_media_${index + 1}.${isVideo ? "mp4" : "jpg"}`,
    class: "btn small",
    text: "Download"
  });

  const btnRow = el("div", { class: "btn-row" }, [previewBtn, downloadA, openLink]);

  const info = el("div", { class: "media-info" }, [title, btnRow]);

  const card = el("div", { class: "media-card" }, [img, info]);
  return card;
}

// main submit handler
form.addEventListener("submit", async (ev) => {
  ev.preventDefault();
  const url = urlInput.value.trim();
  if (!url) {
    alert("Masukkan URL Instagram terlebih dahulu.");
    return;
  }

  clearResult();
  showStatus("Memproses...", "#bbb");
  loading.style.display = "block";

  try {
    const resp = await fetch("/api/extract", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url })
    });

    // try parse JSON safely
    let payload;
    try {
      payload = await resp.json();
    } catch (err) {
      // Response bukan JSON
      loading.style.display = "none";
      showError("Network error: server returned non-JSON response");
      // show raw text fallback
      try {
        const raw = await resp.text();
        const snippetNode = renderSnippet(raw.slice(0, 2000));
        resultBox.appendChild(snippetNode);
      } catch (e) {
        console.error("failed to read raw text:", e);
      }
      return;
    }

    loading.style.display = "none";

    // if backend returned an error object (our extract.js does this)
    if (!resp.ok || payload.error) {
      const msg = payload.error || `Server error (${payload.status || resp.status})`;
      showError(msg);
      // show snippet if present (helpful for debugging upstream HTML/login pages)
      if (payload.snippet) {
        const s = renderSnippet(payload.snippet);
        resultBox.appendChild(s);
      } else if (payload.detail) {
        const d = el("pre", { class: "error-detail", text: String(payload.detail) });
        resultBox.appendChild(d);
      }
      return;
    }

    // success path: payload should have { status: <num>, data: <object> }
    showStatus("Sukses — lihat hasil di bawah", "lightgreen");

    const items = (payload && payload.data && payload.data.data) || payload.data || [];

    if (!Array.isArray(items)) {
      // if response is object with single media, normalize
      if (items && typeof items === "object") {
        // try common fields
        const normalized = [];
        if (items.media || items.thumb || items.url) normalized.push(items);
        else if (items.data && Array.isArray(items.data)) normalized.push(...items.data);
        else {
          resultBox.innerHTML = "<p style='color:orange'>Response tidak berbentuk array media — check debug</p>";
          if (payload.snippet) resultBox.appendChild(renderSnippet(payload.snippet));
          return;
        }
        // continue with normalized
        normalized.forEach((it, i) => resultBox.appendChild(renderMediaCard(it, i)));
        return;
      } else {
        resultBox.innerHTML = "<p style='color:orange'>Tidak menemukan media.</p>";
        return;
      }
    }

    // render array of items
    items.forEach((it, i) => {
      resultBox.appendChild(renderMediaCard(it, i));
    });

  } catch (err) {
    loading.style.display = "none";
    console.error("Request failed:", err);
    showError("Gagal melakukan request. Cek console.");
  }
});
