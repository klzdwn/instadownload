// script.js (updated: clear button + better UI states + nicer rendering)
(function () {
  const el = (sel, root = document) => root.querySelector(sel);
  const create = (tag, attrs = {}, children = []) => {
    const e = document.createElement(tag);
    Object.entries(attrs).forEach(([k, v]) => {
      if (k === "text") e.textContent = v;
      else if (k === "html") e.innerHTML = v;
      else if (k === "class") e.className = v;
      else e.setAttribute(k, v);
    });
    children.forEach(c => e.appendChild(c));
    return e;
  };

  function findControls() {
    const input = el('#url') || el('input[type="url"]') || el('input[type="text"]') || document.querySelector("input");
    const btnFetch = el('#btnFetch') || Array.from(document.querySelectorAll("button")).find(b => /cari|search|find|download/i.test((b.textContent||b.value||"").trim()));
    const btnClear = el('#btnClear') || Array.from(document.querySelectorAll("button")).find(b => /hapus|clear/i.test((b.textContent||"").trim()));
    let resultContainer = el("#results") || el("#ig-result") || el(".results") || null;
    if (!resultContainer) {
      resultContainer = create("div", { id: "results", style: "margin-top:18px;max-width:840px;" });
      if (input && input.parentNode) input.parentNode.insertBefore(resultContainer, input.nextSibling);
      else document.body.appendChild(resultContainer);
    }
    return { input, btnFetch, btnClear, resultContainer };
  }

  function clearResult(container) { container.innerHTML = ""; }

  function setStatus(container, text, type = 'info') {
    container.querySelectorAll('.ig-msg').forEach(n => n.remove());
    const colors = { info: "#1F2937", success: "#2F855A", error: "#E53E3E" };
    const msg = create("div", { class: "ig-msg", text, style: `padding:8px 12px;border-radius:8px;background:${colors[type]};color:#fff;margin-bottom:12px;` });
    container.prepend(msg);
    return msg;
  }

  function shortText(t, len = 80) {
    if (!t) return "";
    return t.length > len ? t.slice(0, len-3) + "..." : t;
  }

  function renderMediaList(container, data) {
    clearResult(container);
    const payload = data && data.data ? data.data : data;
    setStatus(container, "Sukses — lihat hasil di bawah", "success");

    let items = [];
    if (payload && Array.isArray(payload.data)) items = payload.data;
    else if (payload && Array.isArray(payload)) items = payload;
    else if (payload && payload.data && Array.isArray(payload.data)) items = payload.data;

    if (!items.length) {
      setStatus(container, "Tidak ada media ditemukan pada response.", "error");
      return;
    }

    items.forEach((it, idx) => {
      const card = create("div", { class: "media-card", style: "margin-bottom:14px;" });

      // thumb via proxy if available
      const rawThumb = it.thumb || it.thumbnail || it.preview || (it.media && typeof it.media === "string" ? it.media : null);
      let thumbSrc = "";
      if (rawThumb) thumbSrc = `/api/proxy-thumb?u=${encodeURIComponent(rawThumb)}`;

      const thumb = create("div", { class: "media-thumb" });
      if (thumbSrc) {
        const img = create("img", { src: thumbSrc, alt: `thumb-${idx}`, style: "width:100%;height:100%;object-fit:cover;border-radius:8px" });
        img.addEventListener("error", () => {
          img.style.display = "none";
          thumb.textContent = it.isVideo ? "VIDEO" : "IMAGE";
          thumb.classList.add("media-thumb-fallback");
        });
        thumb.appendChild(img);
      } else {
        thumb.textContent = it.isVideo ? "VIDEO" : "IMAGE";
        thumb.classList.add("media-thumb-fallback");
      }
      card.appendChild(thumb);

      const info = create("div", { class: "media-info" });
      const title = create("div", { text: `Media #${idx + 1}`, style: "font-weight:600;color:var(--text);margin-bottom:6px" });
      info.appendChild(title);

      const mediaUrl = it.media || it.url || it.video || it.src || (it.urls && it.urls[0]) || "";
      const typeText = (it.isVideo || /mp4|video/i.test(mediaUrl)) ? "video" : "image";
      const meta = create("div", { text: `${typeText} • ${shortText(mediaUrl, 120)}`, style: "font-size:13px;color:var(--muted);white-space:normal;word-break:break-all" });
      info.appendChild(meta);

      const actions = create("div", { class: "media-actions" });
      const btnPreview = create("button", { text: "Preview", class: "small-btn" });
      const btnDownload = create("a", { text: "Download", href: mediaUrl || "#", class: "small-btn", style: "background:var(--accent);color:#fff;text-decoration:none", download: "" });
      const btnOpen = create("a", { text: "Open link", href: mediaUrl || "#", target: "_blank", rel: "noopener", class: "small-btn", style: "background:transparent;color:#63B3ED;border:1px solid rgba(255,255,255,0.06);text-decoration:none" });

      btnPreview.addEventListener("click", () => showLightbox(mediaUrl, typeText));
      actions.appendChild(btnPreview);
      actions.appendChild(btnDownload);
      actions.appendChild(btnOpen);

      info.appendChild(actions);
      card.appendChild(info);
      container.appendChild(card);
    });
  }

  function showLightbox(url, type) {
    if (!url) return alert("No media URL");
    const overlay = create("div", { style: "position:fixed;inset:0;background:rgba(0,0,0,0.85);display:flex;align-items:center;justify-content:center;z-index:99999;padding:20px;" });
    const box = create("div", { style: "max-width:100%;max-height:100%;overflow:auto;" });
    if (type === "video" || /\.mp4|video/i.test(url)) {
      const v = create("video", { controls: "", style: "max-width:100%;max-height:80vh;border-radius:8px;background:#000" });
      v.src = url;
      v.autoplay = true;
      box.appendChild(v);
    } else {
      const im = create("img", { src: url, style: "max-width:100%;max-height:80vh;border-radius:8px" });
      box.appendChild(im);
    }
    const close = create("button", { text: "Close", style: "display:block;margin-top:12px;padding:8px 12px;border-radius:8px;background:#E53E3E;color:#fff;border:none;cursor:pointer" });
    close.addEventListener("click", () => document.body.removeChild(overlay));
    box.appendChild(close);
    overlay.appendChild(box);
    document.body.appendChild(overlay);
  }

  async function main() {
    const { input, btnFetch, btnClear, resultContainer } = findControls();
    if (!input || !btnFetch) {
      console.warn("script.js: couldn't find input or fetch button");
      return;
    }

    // clear action
    if (btnClear) btnClear.addEventListener("click", (e) => {
      e.preventDefault();
      if (input) input.value = "";
      clearResult(resultContainer);
    });

    async function doFetch(rawUrl) {
      // disable while loading
      btnFetch.disabled = true;
      if (btnClear) btnClear.disabled = true;
      const origText = btnFetch.textContent;
      btnFetch.textContent = "Mencari…";

      clearResult(resultContainer);
      setStatus(resultContainer, "Mencari media… tunggu sebentar.", "info");

      try {
        const res = await fetch("/api/extract", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: rawUrl })
        });

        const txt = await res.text();
        let json;
        try {
          json = JSON.parse(txt);
        } catch (err) {
          clearResult(resultContainer);
          setStatus(resultContainer, "Upstream tidak mengembalikan JSON. Cek logs.", "error");
          const pre = create("pre", { text: `Non-JSON dari backend:\n${txt.slice(0,1500)}`, style: "white-space:pre-wrap;color:#F56565;background:#2D3748;padding:10px;border-radius:8px;margin-top:8px;" });
          resultContainer.appendChild(pre);
          return;
        }

        if (res.status >= 400) {
          clearResult(resultContainer);
          const msg = json && (json.error || json.detail) ? (json.error || json.detail) : `Server responded ${res.status}`;
          setStatus(resultContainer, msg, "error");
          if (json.snippet) {
            const pre = create("pre", { text: json.snippet, style: "white-space:pre-wrap;color:#E2E8F0;background:#1A202C;padding:10px;border-radius:8px;margin-top:8px;" });
            resultContainer.appendChild(pre);
          }
          return;
        }

        renderMediaList(resultContainer, json);
      } catch (err) {
        clearResult(resultContainer);
        setStatus(resultContainer, "Gagal request ke backend: " + (err.message || err), "error");
        console.error("Request error:", err);
      } finally {
        btnFetch.disabled = false;
        if (btnClear) btnClear.disabled = false;
        btnFetch.textContent = origText;
      }
    }

    btnFetch.addEventListener("click", (ev) => {
      ev.preventDefault();
      const rawUrl = (input.value || "").trim();
      if (!rawUrl) {
        clearResult(resultContainer);
        setStatus(resultContainer, "Masukkan URL Instagram dulu.", "error");
        return;
      }
      doFetch(rawUrl);
    });
  }

  document.addEventListener("DOMContentLoaded", main);
  if (document.readyState === "interactive" || document.readyState === "complete") main();
})();
