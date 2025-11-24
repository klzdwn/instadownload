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
      else if (k === "download") e.setAttribute("download", v);
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
      style: `padding:8px 12px;border-radius:8px;background:${colors[type]};color:#fff;margin-bottom:12px;`
    });
    msg.textContent = text;
    container.appendChild(msg);
    return msg;
  }

  // === REPLACED renderMediaList: thumbnail-card layout ===
  function renderMediaList(container, data) {
    clearResult(container);

    const header = create("div", {
      text: "Sukses — lihat hasil di bawah",
      style: "padding:10px 14px;background:#2F855A;border-radius:10px;color:#fff;margin-bottom:14px;"
    });
    container.appendChild(header);

    // payload: support multiple wrapping shapes
    const payload = (data && data.data && data.data.data) || (data && data.data) || data || [];
    const items = Array.isArray(payload) ? payload : (Array.isArray(payload.data) ? payload.data : []);

    if (!items || items.length === 0) {
      showMessage(container, "Tidak ada media ditemukan.", "error");
      return;
    }

    items.forEach((it, idx) => {
      const mediaUrl =
        it.media || it.url || it.src || (it.urls && it.urls[0]) || "";
      
      const thumb =
        it.thumb ||
        it.thumbnail ||
        it.preview ||
        it.display_url ||
        (typeof mediaUrl === "string" && mediaUrl) ||
        null;

      const type = it.isVideo || (typeof mediaUrl === "string" && /mp4|video/.test(mediaUrl)) ? "video" : "image";

      const card = create("div", {
        class: "media-card",
        style:
          "display:flex;gap:14px;background:#0f1720;padding:14px;border-radius:12px;margin-bottom:16px;align-items:center;"
      });

      // Thumbnail kiri
      const imgWrap = create("div", {
        style: "width:96px;height:96px;border-radius:8px;overflow:hidden;background:#111;flex:0 0 96px;display:flex;align-items:center;justify-content:center;"
      });

      if (thumb) {
        const img = create("img", { src: thumb, style: "width:100%;height:100%;object-fit:cover;display:block" });
        // in some responses thumb might be a long video URL; still use it
        imgWrap.appendChild(img);
      } else {
        imgWrap.appendChild(create("div", {
          text: type.toUpperCase(),
          style: "color:#999;font-size:12px"
        }));
      }

      card.appendChild(imgWrap);

      // Info + tombol
      const info = create("div", { style: "flex:1;min-width:0" });

      info.appendChild(create("div", {
        text: `Media #${idx + 1}`,
        style: "font-size:18px;font-weight:600;margin-bottom:4px;color:#fff"
      }));

      info.appendChild(create("div", {
        text: `${type} • ${mediaUrl}`,
        style: "font-size:12px;color:#a0aec0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-bottom:8px;"
      }));

      const row = create("div", { style: "display:flex;gap:10px;flex-wrap:wrap;margin-top:6px;" });

      // tombol
      const btnPreview = create("button", {
        text: "Preview",
        style: "padding:6px 12px;border-radius:8px;background:#1A202C;color:#fff;border:0;cursor:pointer"
      });
      btnPreview.addEventListener("click", () => {
        showLightbox(mediaUrl, type);
      });

      const btnDownload = create("a", {
        text: "Download",
        href: mediaUrl || "#",
        download: "media",
        style: "padding:6px 12px;border-radius:8px;background:#7b61ff;color:#fff;text-decoration:none;display:inline-block"
      });

      const btnOpen = create("a", {
        text: "Open link",
        href: mediaUrl || "#",
        target: "_blank",
        style: "padding:6px 12px;border-radius:8px;border:1px solid #444;color:#63b3ed;text-decoration:none;display:inline-block"
      });

      row.appendChild(btnPreview);
      row.appendChild(btnDownload);
      row.appendChild(btnOpen);

      info.appendChild(row);
      card.appendChild(info);

      container.appendChild(card);
    });
  }
  // === end renderMediaList ===

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

        // ok render
        renderMediaList(resultContainer, json);

      } catch (err) {
        clearResult(resultContainer);
        showMessage(resultContainer, "Gagal request ke backend: " + (err.message || err), "error");
        console.error("Request error:", err);
      }
    });

    // optional: clear button support (if present)
    const clearBtn = Array.from(document.querySelectorAll("button,input[type=button]")).find(b => /hapus|clear|reset/i.test((b.textContent||b.value||"")));
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
