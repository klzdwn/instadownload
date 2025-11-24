// script.js
// Frontend: ambil url, request backend /api/snap?url=..., parse, render results
(function () {
  const el = (sel, root = document) => root.querySelector(sel);
  const create = (tag, attrs = {}, children = []) => {
    const e = document.createElement(tag);
    Object.entries(attrs).forEach(([k, v]) => {
      if (k === "text") e.textContent = v;
      else if (k === "html") e.innerHTML = v;
      else if (k === "style") e.style.cssText = v;
      else if (k === "class") e.className = v;
      else e.setAttribute(k, v);
    });
    children.forEach(c => e.appendChild(c));
    return e;
  };

  function findControls() {
    const input = el('input[type="url"]') || el('input[type="text"]') || document.querySelector("input");
    const btn = Array.from(document.querySelectorAll("button,input[type=button],input[type=submit]"))
      .find(b => /cari|search|find|download|btn/i.test((b.textContent || b.value || b.id || "").toLowerCase())) || el("#btnFetch") || null;

    let resultContainer = el("#results") || el(".results") || el("#ig-result");
    if (!resultContainer) {
      resultContainer = create("div", { id: "results", style: "margin-top:18px;max-width:920px;margin-left:auto;margin-right:auto;" });
      if (input && input.parentNode) input.parentNode.insertBefore(resultContainer, input.nextSibling);
      else document.body.appendChild(resultContainer);
    }

    return { input, btn, resultContainer };
  }

  function clearResult(container) {
    if (!container) return;
    container.innerHTML = "";
  }

  function showMessage(container, text, type = "info") {
    const colors = { info: "#2D3748", success: "#2F855A", error: "#E53E3E" };
    const bg = colors[type] || colors.info;
    const msg = create("div", {
      class: "ig-msg",
      style: `padding:10px 12px;border-radius:8px;background:${bg};color:#fff;margin-bottom:12px;white-space:pre-wrap;`
    });
    msg.textContent = text;
    container.appendChild(msg);
    return msg;
  }

  // try to detect thumbs/urls inside an object (if json)
  function detectThumbFromObject(it) {
    if (!it) return null;
    return it.thumb || it.thumbnail || it.preview || it.poster || it.thumb_url || it.poster_url || null;
  }

  // create items array from response (html or json)
  function parseResponseText(txt) {
    // try parse JSON first
    try {
      const json = JSON.parse(txt);
      // possible shapes: { data: [...] } or { status:..., data: { data: [...] } } etc.
      let payload = json;
      if (json && json.data) payload = json.data;
      // if payload is object with data array inside
      if (payload && Array.isArray(payload)) {
        return payload.map(it => {
          const media = (typeof it === "string") ? it : (it.media || it.url || it.video || it.src || (Array.isArray(it.urls) && it.urls[0]) || null);
          return {
            media,
            thumb: detectThumbFromObject(it),
            isVideo: !!(it.isVideo || (it.is_video) || /(mp4|video)/.test(String(media || "")))
          };
        }).filter(i => i.media);
      }
      // fallback: single object
      if (payload && typeof payload === "object") {
        const candidates = [];
        // if object has media keys
        const maybeMedia = payload.media || payload.url || payload.video || payload.src || null;
        if (maybeMedia) {
          candidates.push({
            media: maybeMedia,
            thumb: detectThumbFromObject(payload),
            isVideo: !!/(mp4|video)/.test(String(maybeMedia))
          });
        }
        // check nested arrays
        if (payload.items && Array.isArray(payload.items)) {
          payload.items.forEach(it => {
            const m = it.media || it.url || it.video || (Array.isArray(it.urls) && it.urls[0]) || null;
            if (m) candidates.push({ media: m, thumb: detectThumbFromObject(it), isVideo: !!/(mp4|video)/.test(String(m)) });
          });
        }
        if (candidates.length) return candidates;
      }
    } catch (e) {
      // not json -> proceed to HTML parsing
    }

    // HTML parsing fallback: find direct media links
    // regex to catch http(s) links ending with mp4/jpg/jpeg/png/webp
    const regex = /https?:\/\/[^\s"'<>]+?\.(?:mp4|mov|m4v|jpg|jpeg|png|webp)(?:\?[^\s"'<>]*)?/gi;
    const matches = Array.from(new Set((txt.match(regex) || []))); // unique
    // prefer video links first, group into distinct items (if multiple of same type found, still add)
    const items = matches.map(u => {
      return {
        media: u,
        thumb: null,
        isVideo: !!/\.(mp4|mov|m4v)/i.test(u)
      };
    });

    // also try to find <meta property="og:image" content="..."> as thumb
    const ogImg = (txt.match(/<meta[^>]+property=["']og:image["'][^>]*content=["']([^"']+)["']/i) || [])[1];
    if (ogImg && items.length && !items[0].thumb) items[0].thumb = ogImg;

    // If no matches, return empty
    return items;
  }

  // render list of media
  function renderMediaList(container, items) {
    clearResult(container);
    if (!items || !items.length) {
      showMessage(container, "Tidak ada media ditemukan pada response.", "error");
      return;
    }

    const header = create("div", { style: "color:#2F855A;margin-bottom:10px;font-weight:700" });
    header.textContent = `Sukses — ditemukan ${items.length} item`;
    container.appendChild(header);

    items.forEach((it, idx) => {
      const card = create("div", { style: "background:rgba(0,0,0,0.06);padding:12px;border-radius:12px;margin-bottom:12px;display:flex;gap:12px;align-items:center;" });

      // thumb
      const thumbWrap = create("div", { style: "width:96px;height:96px;flex:0 0 96px;border-radius:8px;overflow:hidden;background:#0c1114;display:flex;align-items:center;justify-content:center" });
      if (it.thumb) {
        // use backend proxy for thumbnails to avoid hotlink / CORS issues if you have /api/thumb
        const proxyThumb = `/api/thumb?url=${encodeURIComponent(it.thumb)}`;
        const img = create("img", { src: proxyThumb, style: "width:100%;height:100%;object-fit:cover;display:block" });
        img.onerror = () => {
          thumbWrap.innerHTML = "";
          thumbWrap.appendChild(create("div", { text: "no thumb", style: "color:#9aa4b2;font-size:13px" }));
        };
        thumbWrap.appendChild(img);
      } else {
        thumbWrap.appendChild(create("div", { text: "no thumb", style: "color:#9aa4b2;font-size:13px" }));
      }
      card.appendChild(thumbWrap);

      // info
      const info = create("div", { style: "flex:1;min-width:0" });
      info.appendChild(create("div", { text: `Media #${idx + 1}`, style: "font-weight:700;color:#e6eef6;margin-bottom:6px" }));
      const typeText = it.isVideo ? "video" : "image";
      info.appendChild(create("div", { text: `${typeText} • ${it.media}`, style: "font-size:12px;color:#99a6b0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis" }));

      // buttons
      const row = create("div", { style: "margin-top:10px;display:flex;gap:8px;flex-wrap:wrap;align-items:center" });
      const btnPreview = create("button", { text: "Preview", style: "padding:8px 12px;border-radius:8px;background:#111827;color:#fff;border:none;cursor:pointer" });
      const btnDownload = create("a", { text: "Download", href: it.media || "#", style: "padding:8px 12px;border-radius:8px;background:#7c3aed;color:#fff;text-decoration:none;display:inline-block", role: "button" });
      const btnOpen = create("a", { text: "Open link", href: it.media || "#", target: "_blank", style: "padding:8px 12px;border-radius:8px;background:transparent;color:#3b82f6;border:1px solid rgba(0,0,0,0.06);text-decoration:none;display:inline-block" });

      // Download behavior:
      // - If media is same-origin -> set download attr (direct)
      // - Else attempt to fetch blob and download (works if server allows CORS). If fails, fallback to open in new tab.
      btnDownload.addEventListener("click", async (e) => {
        e.preventDefault();
        if (!it.media) return alert("No media URL");
        try {
          // same-origin simple download
          if (it.media.startsWith(window.location.origin)) {
            const a = document.createElement("a");
            a.href = it.media;
            a.setAttribute("download", "");
            document.body.appendChild(a);
            a.click();
            a.remove();
            return;
          }

          // try fetch as blob (may fail due to CORS)
          showMessage(container, "Mencoba mengunduh... (jika gagal akan membuka di tab baru)", "info");
          const resp = await fetch(it.media, { mode: "cors" });
          if (!resp.ok) throw new Error("Fetch failed: " + resp.status);
          const blob = await resp.blob();
          const blobUrl = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = blobUrl;
          // try to infer filename
          const filename = (new URL(it.media).pathname.split("/").pop()) || `media-${idx + 1}`;
          a.download = filename;
          document.body.appendChild(a);
          a.click();
          a.remove();
          setTimeout(() => URL.revokeObjectURL(blobUrl), 10000);
        } catch (err) {
          // fallback
          window.open(it.media, "_blank");
        }
      });

      // preview -> lightbox
      btnPreview.addEventListener("click", () => {
        showLightbox(it.media, it.isVideo ? "video" : "image");
      });

      row.appendChild(btnPreview);
      row.appendChild(btnDownload);
      row.appendChild(btnOpen);

      info.appendChild(row);
      card.appendChild(info);

      container.appendChild(card);
    });
  }

  function showLightbox(url, type) {
    if (!url) return alert("No media URL");
    const overlay = create("div", {
      style: "position:fixed;inset:0;background:rgba(0,0,0,0.85);display:flex;align-items:center;justify-content:center;z-index:99999;padding:20px;"
    });
    const box = create("div", { style: "max-width:100%;max-height:100%;overflow:auto;" });
    if (type === "video" || (typeof url === "string" && /\.mp4|video/i.test(url))) {
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
    const { input, btn, resultContainer } = findControls();
    if (!input || !btn) {
      console.warn("script.js: couldn't find input or button.");
      return;
    }

    btn.addEventListener("click", async (ev) => {
      ev.preventDefault();
      const raw = (input.value || "").trim();
      if (!raw) {
        clearResult(resultContainer);
        return showMessage(resultContainer, "Masukkan URL Instagram dulu.", "error");
      }

      clearResult(resultContainer);
      showMessage(resultContainer, "Mencari media…", "info");

      try {
        // send to backend snap proxy (you must deploy /api/snap that posts to snapinsta)
        const api = `/api/snap?url=${encodeURIComponent(raw)}`;
        const res = await fetch(api, { method: "GET" });
        const text = await res.text();

        // server may respond with JSON or HTML. Parse both.
        const items = parseResponseText(text);

        if (!items || items.length === 0) {
          // show JSON/HTML snippet to help debug
          clearResult(resultContainer);
          const pre = create("pre", { text: text.slice(0, 4000), style: "white-space:pre-wrap;color:#e2e8f0;background:#0b1220;padding:10px;border-radius:8px;margin-bottom:12px;overflow:auto" });
          resultContainer.appendChild(pre);
          showMessage(resultContainer, "Parsed JSON but no media found. Cek snippet di atas.", "error");
          return;
        }

        renderMediaList(resultContainer, items);
      } catch (err) {
        clearResult(resultContainer);
        showMessage(resultContainer, "Error: " + (err.message || err), "error");
        console.error(err);
      }
    });
  }

  document.addEventListener("DOMContentLoaded", main);
  if (document.readyState === "interactive" || document.readyState === "complete") main();
})();
