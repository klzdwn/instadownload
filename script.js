// script.js
// Frontend: improved thumbnail handling + preview lightbox
(function () {
  const el = (sel, root = document) => root.querySelector(sel);
  const create = (tag, attrs = {}, children = []) => {
    const e = document.createElement(tag);
    Object.entries(attrs).forEach(([k, v]) => {
      if (k === "text") e.textContent = v;
      else if (k === "html") e.innerHTML = v;
      else if (k === "style") e.style.cssText = v;
      else e.setAttribute(k, v);
    });
    children.forEach(c => e.appendChild(c));
    return e;
  };

  function findControls() {
    const input =
      el('input[type="url"]') ||
      el('input[type="text"]') ||
      el('input[name="url"]') ||
      document.querySelector("input");

    const buttons = Array.from(document.querySelectorAll("button,input[type=button],input[type=submit]"));
    let searchBtn = buttons.find(b => /cari|search|find|download/i.test((b.textContent || b.value || "").trim()));
    if (!searchBtn) searchBtn = buttons[0] || null;

    let resultContainer = el("#ig-result") || el(".result") || el(".results") || null;
    if (!resultContainer) {
      resultContainer = create("div", { id: "ig-result", style: "margin-top:18px;max-width:840px;" });
      if (input && input.parentNode) input.parentNode.insertBefore(resultContainer, input.nextSibling);
      else document.body.appendChild(resultContainer);
    }

    return { input, searchBtn, resultContainer };
  }

  function clearResult(container) { container.innerHTML = ""; }

  function showMessage(container, text, type = "info") {
    const colors = { info: "#2D3748", success: "#2F855A", error: "#E53E3E" };
    const msg = create("div", {
      class: "ig-msg",
      style: `padding:8px 12px;border-radius:8px;background:${colors[type]};color:#fff;margin-bottom:12px;`
    });
    msg.textContent = text;
    container.appendChild(msg);
    return msg;
  }

  // Try to choose the best thumbnail from an item object
  function pickThumb(item) {
    // common fields providers use
    const candidates = [];

    // explicit thumb fields
    if (item.thumb) candidates.push(item.thumb);
    if (item.thumbnail) candidates.push(item.thumbnail);
    if (item.preview) candidates.push(item.preview);
    if (item.cover) candidates.push(item.cover);
    if (item.poster) candidates.push(item.poster);

    // sometimes "media" is a string (image or video); if it's an image use it
    if (typeof item.media === "string") {
      const m = item.media;
      // use media if looks like an image url
      if (m.match(/\.(jpe?g|png|webp|gif)(?:\?|$)/i)) candidates.push(m);
    }

    // sometimes provider returns array of urls
    if (Array.isArray(item.urls) && item.urls.length) {
      candidates.push(...item.urls);
    }
    if (Array.isArray(item.media) && item.media.length) {
      // media array might contain objects/strings: flatten strings first
      item.media.forEach(m => { if (typeof m === "string") candidates.push(m); else if (m && m.url) candidates.push(m.url); });
    }

    // remove falsy and dedupe
    const uniq = [...new Set(candidates.filter(Boolean))];
    return uniq;
  }

  // show thumbnail node: returns element
  function makeThumbNode(thumbCandidates, mediaUrl, isVideo) {
    const wrap = create("div", { style: "width:96px;height:96px;flex:0 0 96px;border-radius:8px;overflow:hidden;background:#111;display:flex;align-items:center;justify-content:center" });

    // create image element and progressively try candidates
    const img = create("img", { alt: "thumbnail", loading: "lazy", style: "width:100%;height:100%;object-fit:cover;display:block" });
    img.addEventListener("error", () => {
      // if error, show fallback overlay (video icon or text)
      img.style.display = "none";
      const fallback = create("div", { class: "thumb-fallback", text: isVideo ? "VIDEO" : "NO IMAGE", style: "color:#9aa4b2;font-size:13px;display:flex;align-items:center;justify-content:center;width:100%;height:100%;background:#061018" });
      wrap.appendChild(fallback);
    });

    // try set first valid candidate; browsers will fire onerror if blocked/unavailable
    if (thumbCandidates && thumbCandidates.length) {
      img.src = thumbCandidates[0];
    } else {
      img.style.display = "none";
      const fallback = create("div", { class: "thumb-fallback", text: isVideo ? "VIDEO" : "NO IMAGE", style: "color:#9aa4b2;font-size:13px;display:flex;align-items:center;justify-content:center;width:100%;height:100%;background:#061018" });
      wrap.appendChild(fallback);
    }

    wrap.appendChild(img);

    // clicking thumbnail opens preview (prefer poster/image, otherwise mediaUrl)
    wrap.style.cursor = "pointer";
    wrap.addEventListener("click", (e) => {
      const src = (img && img.src && img.style.display !== "none") ? img.src : mediaUrl;
      if (!src) return alert("No media to preview");
      showLightbox(src, isVideo ? "video" : (src.match(/\.mp4|video/) ? "video" : "image"));
    });

    return wrap;
  }

  function renderMediaList(container, data) {
    clearResult(container);
    const payload = data && data.data ? data.data : data; // support wrapper
    const header = create("div", { style: "color:#9AE6B4;margin-bottom:8px" });
    header.textContent = "Sukses — lihat hasil di bawah";
    container.appendChild(header);

    let items = [];
    if (payload && Array.isArray(payload.data)) items = payload.data;
    else if (Array.isArray(payload)) items = payload;
    else if (payload && payload.data && Array.isArray(payload.data)) items = payload.data;

    if (!items.length) {
      showMessage(container, "Tidak ada media ditemukan pada response.", "error");
      return;
    }

    items.forEach((it, idx) => {
      const card = create("div", {
        class: "ig-card",
        style: "background:rgba(255,255,255,0.03);padding:14px;border-radius:12px;margin-bottom:12px;display:flex;gap:12px;align-items:flex-start;"
      });

      const mediaUrl = it.media || it.url || it.video || it.src || (it.urls && it.urls[0]) || "";
      const isVideo = !!(it.isVideo || /mp4|video/.test(mediaUrl));

      // pick thumbnails (try list)
      const thumbCandidates = pickThumb(it);
      // If no explicit thumbs, try using the mediaUrl but only if it looks like an image
      if (!thumbCandidates.length && mediaUrl && mediaUrl.match(/\.(jpe?g|png|webp|gif)(?:\?|$)/i)) {
        thumbCandidates.push(mediaUrl);
      }

      const thumbNode = makeThumbNode(thumbCandidates, mediaUrl, isVideo);
      card.appendChild(thumbNode);

      const info = create("div", { style: "flex:1;min-width:0" });
      const title = create("div", { text: `Media #${idx + 1}`, style: "font-weight:600;color:#E2E8F0;margin-bottom:6px" });
      info.appendChild(title);

      const metaText = mediaUrl ? mediaUrl : (it.caption || it.title || "");
      const meta = create("div", { text: metaText, style: "font-size:13px;color:#CBD5E0;white-space:normal;overflow:hidden;text-overflow:ellipsis" });
      meta.title = metaText;
      info.appendChild(meta);

      const row = create("div", { style: "margin-top:10px;display:flex;gap:8px;flex-wrap:wrap" });

      const btnPreview = create("button", { text: "Preview", style: "padding:6px 10px;border-radius:8px;background:#1A202C;color:#fff;border:none;cursor:pointer" });
      btnPreview.addEventListener("click", () => showLightbox(mediaUrl || thumbCandidates[0] || "", isVideo ? "video" : "image"));

      const btnDownload = create("a", { text: "Download", href: mediaUrl || thumbCandidates[0] || "#", style: "padding:6px 10px;border-radius:8px;background:#6B46C1;color:#fff;text-decoration:none;display:inline-block" });
      if (btnDownload.href && btnDownload.href !== "#") btnDownload.setAttribute("download", "");

      const btnOpen = create("a", { text: "Open link", href: mediaUrl || thumbCandidates[0] || "#", target: "_blank", style: "padding:6px 10px;border-radius:8px;background:transparent;color:#63B3ED;border:1px solid rgba(255,255,255,0.06);text-decoration:none;display:inline-block" });

      row.appendChild(btnPreview);
      row.appendChild(btnDownload);
      row.appendChild(btnOpen);

      info.appendChild(row);
      card.appendChild(info);
      container.appendChild(card);
    });
  }

  // lightbox (image/video)
  function showLightbox(url, type) {
    if (!url) return alert("No media URL");
    const overlay = create("div", {
      style: "position:fixed;inset:0;background:rgba(0,0,0,0.85);display:flex;align-items:center;justify-content:center;z-index:99999;padding:20px;"
    });
    const box = create("div", { style: "max-width:100%;max-height:100%;overflow:auto;text-align:center;" });
    if (type === "video" || url.match(/\.mp4|video/)) {
      const v = create("video", { controls: "", style: "max-width:100%;max-height:80vh;border-radius:8px;background:#000" });
      v.src = url;
      v.autoplay = true;
      box.appendChild(v);
    } else {
      const im = create("img", { src: url, style: "max-width:100%;max-height:80vh;border-radius:8px" });
      box.appendChild(im);
    }
    const close = create("button", { text: "Close", style: "display:block;margin:14px auto 0;padding:8px 12px;border-radius:8px;background:#E53E3E;color:#fff;border:none;cursor:pointer" });
    close.addEventListener("click", () => document.body.removeChild(overlay));
    overlay.addEventListener("click", (ev) => { if (ev.target === overlay) document.body.removeChild(overlay); });
    box.appendChild(close);
    overlay.appendChild(box);
    document.body.appendChild(overlay);
  }

  // main flow
  async function main() {
    const { input, searchBtn, resultContainer } = findControls();
    if (!input || !searchBtn) {
      console.warn("script.js: couldn't find input or search button.");
      return;
    }

    searchBtn.addEventListener("click", async (ev) => {
      ev.preventDefault();
      const rawUrl = (input.value || "").trim();
      if (!rawUrl) {
        clearResult(resultContainer);
        showMessage(resultContainer, "Masukkan URL Instagram dulu.", "error");
        return;
      }

      clearResult(resultContainer);
      showMessage(resultContainer, "Mencari media… tunggu sebentar.", "info");

      try {
        const res = await fetch("/api/extract", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: rawUrl })
        });

        const txt = await res.text();
        let json;
        try { json = JSON.parse(txt); } catch (err) {
          clearResult(resultContainer);
          showMessage(resultContainer, "Upstream tidak mengembalikan JSON. Cek logs.", "error");
          const pre = create("pre", { text: `Non - JSON from backend:\n${txt.slice(0, 1500)}`, style: "white-space:pre-wrap;color:#F56565;background:#2D3748;padding:10px;border-radius:8px;margin-top:8px;" });
          resultContainer.appendChild(pre);
          return;
        }

        if (res.status >= 400) {
          clearResult(resultContainer);
          const msg = json && (json.error || json.detail) ? (json.error || json.detail) : `Server responded ${res.status}`;
          showMessage(resultContainer, msg, "error");
          if (json.snippet) {
            const pre = create("pre", { text: json.snippet, style: "white-space:pre-wrap;color:#E2E8F0;background:#1A202C;padding:10px;border-radius:8px;margin-top:8px;" });
            resultContainer.appendChild(pre);
          }
          return;
        }

        renderMediaList(resultContainer, json);
      } catch (err) {
        clearResult(resultContainer);
        showMessage(resultContainer, "Gagal request ke backend: " + (err.message || err), "error");
        console.error("Request error:", err);
      }
    });
  }

  document.addEventListener("DOMContentLoaded", main);
  if (document.readyState === "interactive" || document.readyState === "complete") main();
})();
