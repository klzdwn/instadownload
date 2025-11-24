// script.js
// Frontend minimal: find input/button, call /api/extract, render results
(function () {
  // helpers
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
    const input =
      el('input[type="url"]') ||
      el('input[type="text"]') ||
      el('input[name="url"]') ||
      document.querySelector("input");

    const buttons = Array.from(document.querySelectorAll("button,input[type=button],input[type=submit]"));
    let searchBtn = buttons.find(b => /cari|search|find|download/i.test((b.textContent || b.value || "").trim()));
    if (!searchBtn) searchBtn = buttons[0] || null;

    let clearBtn = buttons.find(b => /hapus|clear|reset/i.test((b.textContent || b.value || "").trim()));
    if (!clearBtn) clearBtn = null;

    let resultContainer = el("#results") || el(".results") || null;
    if (!resultContainer) {
      resultContainer = create("div", { id: "results", style: "margin-top:18px" });
      if (input && input.parentNode) input.parentNode.insertBefore(resultContainer, input.nextSibling);
      else document.body.appendChild(resultContainer);
    }

    return { input, searchBtn, clearBtn, resultContainer };
  }

  function clearResult(container) {
    if (!container) return;
    container.innerHTML = "";
  }

  function showMessage(container, text, type = "info") {
    const colors = { info: "#2D3748", success: "#2F855A", error: "#E53E3E" };
    const msg = create("div", {
      class: "ig-msg",
      style: `padding:10px 12px;border-radius:8px;background:${colors[type]||colors.info};color:#fff;margin-bottom:12px;`
    });
    msg.textContent = text;
    container.appendChild(msg);
    return msg;
  }

  // Detect thumbnail from many possible keys/responses
  function detectThumb(item) {
    if (!item) return null;
    const keys = ["thumb","thumbnail","preview","poster","thumbnail_url","thumb_url","cover","image"];
    for (const k of keys) {
      if (item[k] && typeof item[k] === "string" && item[k].trim()) return item[k].trim();
    }
    // sometimes item.media is array of urls or object with preview
    if (Array.isArray(item.media) && item.media.length) {
      // if media entries are objects with thumb or url
      const first = item.media[0];
      if (typeof first === "string") return first;
      if (first && typeof first === "object") {
        for (const k of keys) if (first[k]) return first[k];
        if (first.url) return first.url;
      }
    }
    // some providers put poster or thumbnail inside item.video_info etc
    if (item.video && typeof item.video === "object") {
      return item.video.poster || item.video.thumbnail || null;
    }
    return null;
  }

  function detectMediaUrl(item) {
    if (!item) return "";
    if (item.media && typeof item.media === "string") return item.media;
    if (item.url) return item.url;
    if (item.video) return item.video;
    if (item.src) return item.src;
    if (Array.isArray(item.media) && item.media.length) {
      // prefer first string url
      const s = item.media.find(m => typeof m === "string");
      if (s) return s;
      if (item.media[0] && typeof item.media[0] === "object") {
        return item.media[0].url || item.media[0].src || "";
      }
    }
    return "";
  }

  function renderMediaList(container, data) {
    clearResult(container);
    const header = create("div", { style: "color:#9AE6B4;margin-bottom:8px;font-weight:600" });
    header.textContent = "Sukses — lihat hasil di bawah";
    container.appendChild(header);

    // find items array
    let payload = data;
    if (data && data.data) payload = data.data;
    let items = [];
    if (Array.isArray(payload)) items = payload;
    else if (payload && Array.isArray(payload.data)) items = payload.data;
    else if (payload && Array.isArray(payload.items)) items = payload.items;

    if (!items || items.length === 0) {
      showMessage(container, "Tidak ada media ditemukan pada response.", "error");
      return;
    }

    items.forEach((it, idx) => {
      const card = create("div", { style: "background:rgba(255,255,255,0.03);padding:14px;border-radius:12px;margin-bottom:12px;display:flex;gap:12px;align-items:flex-start" });

      // thumbnail
      const thumbWrap = create("div", { style: "width:96px;height:96px;flex:0 0 96px;border-radius:8px;overflow:hidden;background:#061018;display:flex;align-items:center;justify-content:center" });
      const thumbUrl = detectThumb(it);
      if (thumbUrl) {
        const img = create("img", { src: thumbUrl, style: "width:100%;height:100%;object-fit:cover;display:block" });
        img.alt = `thumb-${idx+1}`;
        // fallback if image not load
        img.onerror = () => {
          // clear and put fallback text
          thumbWrap.innerHTML = "";
          thumbWrap.appendChild(create("div", { text: "no thumb", style: "color:#9aa4b2;font-size:13px" }));
        };
        thumbWrap.appendChild(img);
      } else {
        thumbWrap.appendChild(create("div", { text: "no thumb", style: "color:#9aa4b2;font-size:13px" }));
      }
      card.appendChild(thumbWrap);

      // info column
      const info = create("div", { style: "flex:1;min-width:0" });
      info.appendChild(create("div", { text: `Media #${idx+1}`, style: "font-weight:700;color:#E2E8F0;margin-bottom:6px" }));

      const mediaUrl = detectMediaUrl(it) || "";
      const isVideo = !!(it.isVideo || it.is_video || /mp4|video/.test(String(mediaUrl)));
      const meta = create("div", { text: `${isVideo ? "video" : "image"} • ${mediaUrl}`, style: "font-size:12px;color:#CBD5E0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis" });
      info.appendChild(meta);

      // actions
      const actions = create("div", { style: "margin-top:10px;display:flex;gap:8px;flex-wrap:wrap;align-items:center" });
      const btnPreview = create("button", { text: "Preview", style: "padding:8px 12px;border-radius:8px;background:#111827;color:#fff;border:none;cursor:pointer" });
      const btnDownload = create("a", { text: "Download", href: mediaUrl || "#", style: "padding:8px 12px;border-radius:8px;background:#6B46C1;color:#fff;text-decoration:none;display:inline-block", download: "" });
      const btnOpen = create("a", { text: "Open link", href: mediaUrl || "#", target: "_blank", rel: "noopener", style: "padding:8px 12px;border-radius:8px;background:transparent;color:#63B3ED;border:1px solid rgba(255,255,255,0.06);text-decoration:none;display:inline-block" });

      btnPreview.addEventListener("click", (e) => {
        e.preventDefault();
        showLightbox(mediaUrl, isVideo ? "video" : "image");
      });

      // if no mediaUrl disable download/open
      if (!mediaUrl) {
        btnDownload.style.opacity = "0.5";
        btnDownload.style.pointerEvents = "none";
        btnOpen.style.opacity = "0.5";
        btnOpen.style.pointerEvents = "none";
      }

      actions.appendChild(btnPreview);
      actions.appendChild(btnDownload);
      actions.appendChild(btnOpen);

      info.appendChild(actions);
      card.appendChild(info);

      container.appendChild(card);
    });
  }

  // simple lightbox
  function showLightbox(url, type) {
    if (!url) return alert("No media URL");
    const overlay = create("div", {
      style: "position:fixed;inset:0;background:rgba(0,0,0,0.85);display:flex;align-items:center;justify-content:center;z-index:99999;padding:20px;"
    });
    const box = create("div", { style: "max-width:100%;max-height:100%;overflow:auto;" });
    if (type === "video" || (typeof url === "string" && url.match(/\.mp4|video/))) {
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

  // main flow
  async function main() {
    const { input, searchBtn, clearBtn, resultContainer } = findControls();
    if (!input || !searchBtn) {
      console.warn("script.js: couldn't find input or search button - ensure page has an input and a button.");
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
        try {
          json = JSON.parse(txt);
        } catch (err) {
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

        // we got valid JSON, render
        // some responses wrap data under { status, data: { data: [...] }}
        // pass the whole json so renderMediaList can find items
        renderMediaList(resultContainer, json && json.data ? json.data : json);

      } catch (err) {
        clearResult(resultContainer);
        showMessage(resultContainer, "Gagal request ke backend: " + (err.message || err), "error");
        console.error("Request error:", err);
      }
    });

    // clear button
    if (clearBtn) {
      clearBtn.addEventListener("click", (e) => {
        e.preventDefault();
        if (input) input.value = "";
        const rc = findControls().resultContainer;
        if (rc) clearResult(rc);
      });
    } else {
      // also support any element with text 'Hapus' if present
      const maybeClear = Array.from(document.querySelectorAll("button,input[type=button]")).find(b => /hapus|clear/i.test((b.textContent||b.value||"").toLowerCase()));
      if (maybeClear) {
        maybeClear.addEventListener("click", (e) => {
          e.preventDefault();
          if (input) input.value = "";
          const rc = findControls().resultContainer;
          if (rc) clearResult(rc);
        });
      }
    }
  }

  document.addEventListener("DOMContentLoaded", main);
  if (document.readyState === "interactive" || document.readyState === "complete") main();
})();
