// script.js (replace your existing file with this)
(function () {
  // simple helpers
  const el = (sel, root = document) => root.querySelector(sel);
  const create = (tag, attrs = {}, children = []) => {
    const e = document.createElement(tag);
    for (const k in attrs) {
      if (!Object.prototype.hasOwnProperty.call(attrs, k)) continue;
      const v = attrs[k];
      if (k === "text") e.textContent = v;
      else if (k === "html") e.innerHTML = v;
      else e.setAttribute(k, v);
    }
    (children || []).forEach(c => e.appendChild(c));
    return e;
  };

  function findControls() {
    const input = el("#url") || el('input[type="url"]') || el('input[type="text"]') || document.querySelector("input");
    const fetchBtn = el("#btnFetch") || Array.from(document.querySelectorAll("button,input[type=button],input[type=submit]")).find(b => /cari|search|find|download/i.test((b.textContent||b.value||"").trim())) || document.querySelector("button");
    const clearBtn = el("#btnClear") || Array.from(document.querySelectorAll("button,input[type=button]")).find(b => /hapus|clear|reset/i.test((b.textContent||b.value||"").trim()));
    let resultContainer = el("#results") || el(".results") || el("#ig-result");
    if (!resultContainer) {
      resultContainer = create("div", { id: "results", style: "margin-top:18px;" });
      if (input && input.parentNode) input.parentNode.insertBefore(resultContainer, input.nextSibling);
      else document.body.appendChild(resultContainer);
    }
    return { input, fetchBtn, clearBtn, resultContainer };
  }

  function clearResult(container) {
    if (!container) return;
    container.innerHTML = "";
  }

  function showMessage(container, text, type = "info") {
    const colors = { info: "#2D3748", success: "#2F855A", error: "#E53E3E" };
    const msg = create("div", {
      style: `padding:10px 12px;border-radius:8px;background:${colors[type]||colors.info};color:#fff;margin-bottom:12px;`
    });
    msg.textContent = text;
    container.appendChild(msg);
    return msg;
  }

  function detectThumb(item) {
    // common keys used by API responses
    return item.thumb || item.thumbnail || item.preview || item.poster || item.thumbnail_url || (item.media && typeof item.media === "string" && item.media.match(/\.(jpe?g|png|webp)$/i) ? item.media : null);
  }

  function detectMediaUrl(item) {
    return item.media || item.url || item.video || item.src || (Array.isArray(item.urls) ? item.urls[0] : null) || "";
  }

  function renderMediaList(container, json) {
    clearResult(container);
    const header = create("div", { style: "color:#9AE6B4;margin-bottom:8px;font-weight:600" });
    header.textContent = "Sukses — lihat hasil di bawah";
    container.appendChild(header);

    // find items array in response
    let payload = json;
    if (json && json.data) payload = json.data;
    // payload might have { data: [...] } or be the array itself
    let items = [];
    if (Array.isArray(payload)) items = payload;
    else if (payload && Array.isArray(payload.data)) items = payload.data;
    else if (payload && Array.isArray(payload.items)) items = payload.items;

    if (!items || !items.length) {
      showMessage(container, "Tidak ada media ditemukan pada response.", "error");
      return;
    }

    items.forEach((it, idx) => {
      const card = create("div", { style: "background:rgba(255,255,255,0.03);padding:12px;border-radius:10px;margin-bottom:12px;display:flex;gap:12px;align-items:center" });

      // thumbnail
      const thumbWrap = create("div", { style: "width:96px;height:96px;flex:0 0 96px;border-radius:8px;overflow:hidden;background:#061018;display:flex;align-items:center;justify-content:center" });
      const thumb = detectThumb(it);
      if (thumb) {
        const img = create("img", { src: thumb, style: "width:100%;height:100%;object-fit:cover;display:block" });
        // if image fails to load, fallback text
        img.onerror = () => {
          thumbWrap.innerHTML = "";
          thumbWrap.appendChild(create("div", { text: "no thumb", style: "color:#9aa4b2;font-size:12px" }));
        };
        thumbWrap.appendChild(img);
      } else {
        thumbWrap.appendChild(create("div", { text: it.isVideo ? "VIDEO" : "IMAGE", style: "color:#9aa4b2;font-size:12px" }));
      }
      card.appendChild(thumbWrap);

      // info
      const info = create("div", { style: "flex:1;min-width:0" });
      info.appendChild(create("div", { text: `Media #${idx+1}`, style: "font-weight:700;color:#E2E8F0;margin-bottom:6px" }));

      const mediaUrl = detectMediaUrl(it);
      const typeText = (it.isVideo || /mp4|video/.test(mediaUrl)) ? "video" : "image";
      const meta = create("div", { text: `${typeText} • ${mediaUrl}`, style: "font-size:13px;color:#B8C2CC;white-space:nowrap;overflow:hidden;text-overflow:ellipsis" });
      info.appendChild(meta);

      const actions = create("div", { style: "margin-top:10px;display:flex;gap:8px;flex-wrap:wrap;align-items:center" });
      const btnPreview = create("button", { text: "Preview", style: "padding:8px 12px;border-radius:8px;background:#111827;color:#fff;border:none;cursor:pointer" });
      const btnDownload = create("a", { text: "Download", href: mediaUrl || "#", style: "padding:8px 12px;border-radius:8px;background:#6B46C1;color:#fff;text-decoration:none;display:inline-block" });
      const btnOpen = create("a", { text: "Open link", href: mediaUrl || "#", target: "_blank", style: "padding:8px 12px;border-radius:8px;background:transparent;color:#63B3ED;border:1px solid rgba(255,255,255,0.06);text-decoration:none;display:inline-block" });

      btnPreview.addEventListener("click", () => showLightbox(mediaUrl, typeText));
      // ensure download uses proper attribute to prompt save where possible
      if (btnDownload && mediaUrl) {
        btnDownload.setAttribute("download", "");
        btnDownload.setAttribute("rel", "noopener noreferrer");
      }

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
    const box = create("div", { style: "max-width:100%;max-height:100%;overflow:auto;text-align:center" });
    if (type === "video" || (typeof url === "string" && url.match(/\.mp4|video/))) {
      const v = create("video", { controls: "", style: "max-width:100%;max-height:80vh;border-radius:8px;background:#000;display:block;margin:0 auto" });
      v.src = url;
      v.autoplay = true;
      box.appendChild(v);
    } else {
      const im = create("img", { src: url, style: "max-width:100%;max-height:80vh;border-radius:8px;display:block;margin:0 auto" });
      box.appendChild(im);
    }
    const close = create("button", { text: "Close", style: "display:block;margin:12px auto 0;padding:8px 12px;border-radius:8px;background:#E53E3E;color:#fff;border:none;cursor:pointer" });
    close.addEventListener("click", () => document.body.removeChild(overlay));
    box.appendChild(close);
    overlay.appendChild(box);
    document.body.appendChild(overlay);
  }

  // main
  async function main() {
    const { input, fetchBtn, clearBtn, resultContainer } = findControls();
    if (!input || !fetchBtn) {
      console.warn("script.js: couldn't find input or search button - ensure page has an input and a button.");
      return;
    }

    // handle click
    fetchBtn.addEventListener("click", async (ev) => {
      ev.preventDefault();
      const rawUrl = (input.value || "").trim();
      clearResult(resultContainer);
      if (!rawUrl) {
        showMessage(resultContainer, "Masukkan URL Instagram dulu.", "error");
        return;
      }
      showMessage(resultContainer, "Mencari media… tunggu sebentar.", "info");

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
          showMessage(resultContainer, "Upstream tidak mengembalikan JSON. Cek logs.", "error");
          const pre = create("pre", { text: `Non - JSON from backend:\n${txt.slice(0, 2000)}`, style: "white-space:pre-wrap;color:#F56565;background:#2D3748;padding:10px;border-radius:8px;margin-top:8px;" });
          resultContainer.appendChild(pre);
          return;
        }

        if (res.status >= 400) {
          clearResult(resultContainer);
          const msg = (json && (json.error || json.detail)) ? (json.error || json.detail) : `Server responded ${res.status}`;
          showMessage(resultContainer, msg, "error");
          if (json.snippet) {
            const pre = create("pre", { text: json.snippet, style: "white-space:pre-wrap;color:#E2E8F0;background:#1A202C;padding:10px;border-radius:8px;margin-top:8px;" });
            resultContainer.appendChild(pre);
          }
          return;
        }

        // render
        renderMediaList(resultContainer, json);
      } catch (err) {
        clearResult(resultContainer);
        showMessage(resultContainer, "Gagal request ke backend: " + (err.message || err), "error");
        console.error("Request error:", err);
      }
    });

    // clear button (if exists)
    if (clearBtn) {
      clearBtn.addEventListener("click", (e) => {
        e.preventDefault();
        if (input) input.value = "";
        clearResult(resultContainer);
      });
    }
  }

  document.addEventListener("DOMContentLoaded", main);
  if (document.readyState === "interactive" || document.readyState === "complete") main();
})();
