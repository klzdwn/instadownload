// script.js — FULL FIXED VERSION
(function () {
  // Helpers
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

  // Detect thumbnail fields from API
  function detectThumb(item) {
    if (!item) return null;
    return (
      item.thumb ||
      item.thumbnail ||
      item.preview ||
      item.poster ||
      item.poster_url ||
      item.thumb_url ||
      null
    );
  }

  function detectMediaUrl(item) {
    if (!item) return "";
    if (typeof item === "string") return item;
    return (
      item.media ||
      item.url ||
      item.video ||
      item.src ||
      (Array.isArray(item.urls) && item.urls[0]) ||
      ""
    );
  }

  // Detect controls
  function findControls() {
    const input =
      el('input[type="url"]') ||
      el('input[type="text"]') ||
      el('input[name="url"]') ||
      document.querySelector("input");

    const buttons = Array.from(
      document.querySelectorAll("button,input[type=button],input[type=submit]")
    );
    let searchBtn = buttons.find(b =>
      /cari|search|find|download/i.test(
        (b.textContent || b.value || "").trim()
      )
    );
    if (!searchBtn) searchBtn = el("#btnFetch") || buttons[0] || null;

    let resultContainer = el("#results") || el(".results") || el("#ig-result");
    if (!resultContainer) {
      resultContainer = create("div", {
        id: "results",
        style: "margin-top:18px;max-width:840px;"
      });
      if (input && input.parentNode)
        input.parentNode.insertBefore(resultContainer, input.nextSibling);
      else document.body.appendChild(resultContainer);
    }

    return { input, searchBtn, resultContainer };
  }

  // Clear results
  function clearResult(container) {
    if (!container) return;
    container.innerHTML = "";
  }

  function showMessage(container, text, type = "info") {
    const colors = {
      info: "#2D3748",
      success: "#2F855A",
      error: "#E53E3E"
    };
    const bg = colors[type] || colors.info;
    const msg = create("div", {
      style: `padding:10px 12px;border-radius:8px;background:${bg};color:#fff;margin-bottom:12px;`
    });
    msg.textContent = text;
    container.appendChild(msg);
    return msg;
  }

  // Find first array of objects anywhere inside JSON
  function findArrayDeep(obj, visited = new WeakSet()) {
    if (!obj || typeof obj !== "object") return null;
    if (visited.has(obj)) return null;
    visited.add(obj);

    if (Array.isArray(obj)) {
      if (obj.length && obj.every(x => typeof x === "object")) return obj;
      for (const el of obj) {
        const found = findArrayDeep(el, visited);
        if (found) return found;
      }
      return null;
    }

    for (const k in obj) {
      const found = findArrayDeep(obj[k], visited);
      if (found) return found;
    }
    return null;
  }

  // Render results
  function renderMediaList(container, json) {
    clearResult(container);

    // Show raw JSON debug (max 250 lines)
    const dbg = create("pre", {
      text: JSON.stringify(json, null, 2),
      style:
        "white-space:pre-wrap;background:#0b1320;color:#bcd;padding:10px;border-radius:8px;margin-bottom:12px;overflow:auto;max-height:260px;font-size:12px;"
    });
    container.appendChild(dbg);

    const payload = json.data ? json.data : json;

    // Find items array automatically
    let items =
      findArrayDeep(payload) ||
      (Array.isArray(payload) ? payload : []) ||
      [];

    if (!items || !items.length) {
      showMessage(container, "Tidak ada media ditemukan pada response.", "error");
      return;
    }

    // Success header
    const header = create("div", {
      style: "color:#9AE6B4;margin-bottom:8px;font-weight:600"
    });
    header.textContent = "Sukses — lihat hasil di bawah";
    container.appendChild(header);

    // Render each media card
    items.forEach((it, idx) => {
      const card = create("div", {
        style:
          "background:rgba(255,255,255,0.03);padding:14px;border-radius:12px;margin-bottom:12px;display:flex;gap:12px;align-items:center;"
      });

      // Thumbnail
      const thumbWrap = create("div", {
        style:
          "width:96px;height:96px;flex:0 0 96px;border-radius:8px;overflow:hidden;background:#061018;display:flex;align-items:center;justify-content:center"
      });

      const thumbSrc = detectThumb(it);
      if (thumbSrc) {
        const proxied = `/api/proxy-thumb?url=${encodeURIComponent(thumbSrc)}`;
        const img = create("img", {
          src: proxied,
          style: "width:100%;height:100%;object-fit:cover;display:block"
        });

        img.onerror = () => {
          if (img.src !== thumbSrc) {
            img.src = thumbSrc;
            img.onerror = () => {
              thumbWrap.innerHTML = "";
              thumbWrap.appendChild(
                create("div", {
                  text: "no thumb",
                  style: "color:#9aa4b2;font-size:13px"
                })
              );
            };
          } else {
            thumbWrap.innerHTML = "";
            thumbWrap.appendChild(
              create("div", {
                text: "no thumb",
                style: "color:#9aa4b2;font-size:13px"
              })
            );
          }
        };

        thumbWrap.appendChild(img);
      } else {
        thumbWrap.appendChild(
          create("div", {
            text: "no thumb",
            style: "color:#9aa4b2;font-size:13px"
          })
        );
      }

      card.appendChild(thumbWrap);

      // Info column
      const info = create("div", { style: "flex:1;min-width:0" });
      const title = create("div", {
        text: `Media #${idx + 1}`,
        style: "font-weight:700;color:#E2E8F0;margin-bottom:6px"
      });
      info.appendChild(title);

      const mediaUrl = detectMediaUrl(it) || "";
      const typeText =
        it.isVideo || /mp4|video/.test(mediaUrl) ? "video" : "image";

      const meta = create("div", {
        text: `${typeText} • ${mediaUrl}`,
        style:
          "font-size:12px;color:#CBD5E0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis"
      });
      info.appendChild(meta);

      // Buttons row
      const row = create("div", {
        style: "margin-top:10px;display:flex;gap:8px;flex-wrap:wrap;align-items:center"
      });

      const btnPreview = create("button", {
        text: "Preview",
        style:
          "padding:8px 12px;border-radius:8px;background:#1A202C;color:#fff;border:none;cursor:pointer"
      });

      const btnDownload = create("a", {
        text: "Download",
        href: mediaUrl || "#",
        style:
          "padding:8px 12px;border-radius:8px;background:#6B46C1;color:#fff;text-decoration:none;display:inline-block"
      });

      const btnOpen = create("a", {
        text: "Open link",
        href: mediaUrl || "#",
        target: "_blank",
        style:
          "padding:8px 12px;border-radius:8px;background:transparent;color:#63B3ED;border:1px solid rgba(255,255,255,0.06);text-decoration:none;display:inline-block"
      });

      // Direct download only if same-origin
      try {
        if (mediaUrl.startsWith(location.origin)) {
          btnDownload.setAttribute("download", "");
        } else {
          btnDownload.addEventListener("click", e => {
            e.preventDefault();
            window.open(mediaUrl, "_blank");
          });
        }
      } catch (e) {}

      // Lightbox preview
      btnPreview.addEventListener("click", () =>
        showLightbox(mediaUrl, typeText)
      );

      row.appendChild(btnPreview);
      row.appendChild(btnDownload);
      row.appendChild(btnOpen);

      info.appendChild(row);
      card.appendChild(info);

      container.appendChild(card);
    });
  }

  // Simple lightbox
  function showLightbox(url, type) {
    if (!url) return alert("No media URL");
    const overlay = create("div", {
      style:
        "position:fixed;inset:0;background:rgba(0,0,0,0.85);display:flex;align-items:center;justify-content:center;z-index:99999;padding:20px;"
    });

    const box = create("div", {
      style: "max-width:100%;max-height:100%;overflow:auto;"
    });

    if (type === "video" || /\.mp4/.test(url)) {
      const v = create("video", {
        controls: "",
        style: "max-width:100%;max-height:80vh;border-radius:8px;background:#000"
      });
      v.src = url;
      v.autoplay = true;
      box.appendChild(v);
    } else {
      const im = create("img", {
        src: url,
        style: "max-width:100%;max-height:80vh;border-radius:8px"
      });
      box.appendChild(im);
    }

    const close = create("button", {
      text: "Close",
      style:
        "display:block;margin-top:12px;padding:8px 12px;border-radius:8px;background:#E53E3E;color:#fff;border:none;cursor:pointer"
    });

    close.addEventListener("click", () =>
      document.body.removeChild(overlay)
    );

    box.appendChild(close);
    overlay.appendChild(box);
    document.body.appendChild(overlay);
  }

  // Main initialize
  async function main() {
    const { input, searchBtn, resultContainer } = findControls();
    if (!input || !searchBtn) return;

    searchBtn.addEventListener("click", async ev => {
      ev.preventDefault();
      const rawUrl = input.value.trim();
      if (!rawUrl) {
        clearResult(resultContainer);
        showMessage(resultContainer, "Masukkan URL Instagram dulu.", "error");
        return;
      }

      clearResult(resultContainer);
      showMessage(resultContainer, "Mencari media…", "info");

      try {
        const res = await fetch("/api/extract", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: rawUrl })
        });

        const text = await res.text();
        let json;

        try {
          json = JSON.parse(text);
        } catch {
          clearResult(resultContainer);
          showMessage(resultContainer, "Backend tidak mengembalikan JSON.", "error");
          container.appendChild(
            create("pre", {
              text: text,
              style:
                "white-space:pre-wrap;background:#2D3748;padding:10px;color:#fff;border-radius:8px;"
            })
          );
          return;
        }

        renderMediaList(resultContainer, json);
      } catch (e) {
        clearResult(resultContainer);
        showMessage(resultContainer, "Gagal request: " + e, "error");
      }
    });

    // Clear button
    const clearBtn = Array.from(
      document.querySelectorAll("button,input[type=button]")
    ).find(
      b =>
        /hapus|clear|reset/i.test((b.textContent || "").trim()) ||
        b.id === "btnClear"
    );

    if (clearBtn) {
      clearBtn.addEventListener("click", e => {
        e.preventDefault();
        input.value = "";
        clearResult(findControls().resultContainer);
      });
    }
  }

  document.addEventListener("DOMContentLoaded", main);
  if (document.readyState !== "loading") main();
})();
