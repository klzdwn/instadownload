// script.js
// Frontend minimal: find input/button, call /api/extract, render results
(function () {
  // small helpers
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

  // try find input + button(s) in the page
  function findControls() {
    const input =
      el('input[type="url"]') ||
      el('input[type="text"]') ||
      el('input[name="url"]') ||
      document.querySelector("input");

    // prefer a button that contains "Cari" or "search" text
    const buttons = Array.from(document.querySelectorAll("button,input[type=button],input[type=submit]"));
    let searchBtn = buttons.find(b => /cari|search|find|download/i.test((b.textContent || b.value || "").trim()));
    if (!searchBtn) searchBtn = buttons[0] || null;

    // container to render result (try to use existing card-like area)
    let resultContainer = el("#ig-result") || el(".result") || el(".results") || null;
    if (!resultContainer) {
      // create a container under the input
      resultContainer = create("div", { id: "ig-result", style: "margin-top:18px;max-width:840px;" });
      if (input && input.parentNode) input.parentNode.insertBefore(resultContainer, input.nextSibling);
      else document.body.appendChild(resultContainer);
    }

    return { input, searchBtn, resultContainer };
  }

  // render helpers
  function clearResult(container) {
    container.innerHTML = "";
  }

  function showMessage(container, text, type = "info") {
    const colors = { info: "#2D3748", success: "#2F855A", error: "#E53E3E" };
    const msg = create("div", {
      class: "ig-msg",
      style: `padding:8px 12px;border-radius:8px;background:${colors[type] || colors.info};color:#fff;margin-bottom:12px;`
    });
    msg.textContent = text;
    container.appendChild(msg);
    return msg;
  }

  function detectThumb(item) {
    // common keys used by API responses
    return item.thumb || item.thumbnail || item.preview || item.poster || item.poster_url || item.thumbnail_url || null;
  }

  function detectMediaUrl(item) {
    return item.media || item.url || item.video || item.src || (Array.isArray(item.urls) ? item.urls[0] : null) || (Array.isArray(item.data) && item.data[0] && (item.data[0].media || item.data[0].url)) || "";
  }

  // try fetch oEmbed thumbnail from Instagram (public posts only)
  async function fetchOEmbedThumb(instaUrl) {
    if (!instaUrl) return null;
    try {
      // Instagram oEmbed is public and returns thumbnail_url for many posts
      const res = await fetch(`https://api.instagram.com/oembed/?url=${encodeURIComponent(instaUrl)}`);
      if (!res.ok) return null;
      const data = await res.json();
      return data.thumbnail_url || data.thumbnail_url_with_play_button || null;
    } catch (e) {
      return null;
    }
  }

  // render list (now async so we can await thumbnail fallback)
  async function renderMediaList(container, data, rawUrl) {
    clearResult(container);
    const payload = data && data.data ? data.data : data;

    // header
    const header = create("div", { style: "color:#9AE6B4;margin-bottom:8px;font-weight:600" });
    header.textContent = "Sukses — lihat hasil di bawah";
    container.appendChild(header);

    // find items array in response
    let items = [];
    if (Array.isArray(payload)) items = payload;
    else if (payload && Array.isArray(payload.data)) items = payload.data;
    else if (payload && Array.isArray(payload.items)) items = payload.items;

    if (!items || !items.length) {
      showMessage(container, "Tidak ada media ditemukan pada response.", "error");
      return;
    }

    // render each
    for (let idx = 0; idx < items.length; idx++) {
      const it = items[idx];
      const card = create("div", {
        style: "background:rgba(255,255,255,0.03);padding:14px;border-radius:12px;margin-bottom:12px;display:flex;gap:12px;align-items:center;"
      });

      // thumbnail container
      const thumbWrap = create("div", { style: "width:96px;height:96px;flex:0 0 96px;border-radius:8px;overflow:hidden;background:#061018;display:flex;align-items:center;justify-content:center" });

      // detect thumbnail
      let thumb = detectThumb(it);

      // if no thumb, try oEmbed fallback using the original post URL (rawUrl)
      if (!thumb && rawUrl) {
        try {
          // await oEmbed only when necessary
          thumb = await fetchOEmbedThumb(rawUrl);
        } catch (e) {
          thumb = null;
        }
      }

      if (thumb) {
        const img = create("img", { src: thumb, style: "width:100%;height:100%;object-fit:cover;display:block" });
        // fallback if image can't load
        img.onerror = () => {
          thumbWrap.innerHTML = "";
          thumbWrap.appendChild(create("div", { text: "no thumb", style: "color:#9aa4b2;font-size:12px" }));
        };
        thumbWrap.appendChild(img);
      } else {
        thumbWrap.appendChild(create("div", { text: "no thumb", style: "color:#9aa4b2;font-size:12px" }));
      }
      card.appendChild(thumbWrap);

      // info column
      const info = create("div", { style: "flex:1;min-width:0" });
      const title = create("div", { text: `Media #${idx + 1}`, style: "font-weight:700;color:#E2E8F0;margin-bottom:6px" });
      info.appendChild(title);

      const mediaUrl = detectMediaUrl(it) || "";
      const typeText = (it.isVideo || /mp4|video/.test(mediaUrl)) ? "video" : "image";
      const meta = create("div", { text: `${typeText} • ${mediaUrl}`, style: "font-size:12px;color:#CBD5E0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis" });
      info.appendChild(meta);

      // actions row
      const row = create("div", { style: "margin-top:10px;display:flex;gap:8px;flex-wrap:wrap;align-items:center" });

      const btnPreview = create("button", { text: "Preview", style: "padding:8px 12px;border-radius:8px;background:#1A202C;color:#fff;border:none;cursor:pointer" });
      const btnDownload = create("a", { text: "Download", href: mediaUrl || "#", style: "padding:8px 12px;border-radius:8px;background:#6B46C1;color:#fff;text-decoration:none;display:inline-block" });
      const btnOpen = create("a", { text: "Open link", href: mediaUrl || "#", target: "_blank", style: "padding:8px 12px;border-radius:8px;background:transparent;color:#63B3ED;border:1px solid rgba(255,255,255,0.06);text-decoration:none;display:inline-block" });

      btnPreview.addEventListener("click", () => showLightbox(mediaUrl, typeText));
      row.appendChild(btnPreview);
      row.appendChild(btnDownload);
      row.appendChild(btnOpen);

      info.appendChild(row);
      card.appendChild(info);
      container.appendChild(card);
    }
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
    const { input, searchBtn, resultContainer } = findControls();
    if (!input || !searchBtn) {
      console.warn("script.js: couldn't find input or search button - ensure page has an input and a button.");
      return;
    }

    // attach click
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

        // try parse
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

        // if error returned
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

        // ok render (pass rawUrl so thumbnails fallback can use oEmbed)
        await renderMediaList(resultContainer, json, rawUrl);

      } catch (err) {
        clearResult(resultContainer);
        showMessage(resultContainer, "Gagal request ke backend: " + (err.message || err), "error");
        console.error("Request error:", err);
      }
    });

    // optional: clear button support (if present)
    const clearBtn = Array.from(document.querySelectorAll("button,input[type=button],input[type=submit]"))
      .find(b => /hapus|clear|reset/i.test((b.textContent || b.value || "").trim()));
    if (clearBtn) {
      clearBtn.addEventListener("click", (e) => {
        e.preventDefault();
        if (input) input.value = "";
        const rc = findControls().resultContainer;
        if (rc) clearResult(rc);
      });
    }
  }

  // run
  document.addEventListener("DOMContentLoaded", main);
  if (document.readyState === "interactive" || document.readyState === "complete") main();
})();
