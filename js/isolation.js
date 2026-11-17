// =====================================================================
// COLOR ISOLATION
// =====================================================================

const ISO_COLORS = [
  { key: "normal", label: "Normal", hex: "#ffffff" },
  { key: "red", label: "Red", hex: "#dc1e1e", hueRanges: [[345, 360], [0, 15]] },
  { key: "orange", label: "Orange", hex: "#ef8a1c", hueRanges: [[15, 45]] },
  { key: "yellow", label: "Yellow", hex: "#f2c230", hueRanges: [[45, 65]] },
  { key: "green", label: "Green", hex: "#1f9254", hueRanges: [[65, 170]] },
  { key: "blue", label: "Blue", hex: "#2f6fed", hueRanges: [[170, 255]] },
  { key: "purple", label: "Purple / Pink", hex: "#8a4fe0", hueRanges: [[255, 345]] },
];

// ---------- Local (client-side) HSV isolation ----------
function rgbToHsv(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d !== 0) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  const s = max === 0 ? 0 : d / max;
  const v = max;
  return { h, s, v };
}

function hueInRanges(h, ranges) {
  return ranges.some(([lo, hi]) => h >= lo && h < hi);
}

function isolateHSV(ctx, canvas, colorObj) {
  const MIN_SAT = 0.18;
  const MIN_VAL = 0.12;
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const d = imageData.data;
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i], g = d[i + 1], b = d[i + 2];
    const { h, s, v } = rgbToHsv(r, g, b);
    const isMatch = s >= MIN_SAT && v >= MIN_VAL && hueInRanges(h, colorObj.hueRanges);
    if (!isMatch) {
      const gray = 0.299 * r + 0.587 * g + 0.114 * b;
      d[i] = d[i + 1] = d[i + 2] = gray;
    }
  }
  ctx.putImageData(imageData, 0, 0);
}

const LocalIsolation = {
  canvas: null,
  img: null,

  init() {
    this.canvas = document.getElementById("iso-canvas");
  },

  hasImage() {
    return !!this.img;
  },

  setImage(img) {
    this.img = img;
    document.getElementById("iso-upload-status").textContent = "Image uploaded.";
    BackendIsolation.switchToLocal();
  },

  render(colorKey) {
    if (!this.img || !this.canvas) return;
    fitCanvasToSource(this.canvas, this.img, 560);
    const ctx = this.canvas.getContext("2d");
    ctx.drawImage(this.img, 0, 0, this.canvas.width, this.canvas.height);
    if (colorKey !== "normal") {
      const colorObj = ISO_COLORS.find((c) => c.key === colorKey);
      isolateHSV(ctx, this.canvas, colorObj);
    }
  },
};

// ---------- Dalton's live camera isolation — Python backend driven ----------
const BackendIsolation = {
  current: "normal",
  pollTimer: null,
  started: false,
  mode: "backend",

  init() {
    this.renderSwatches();
    LocalIsolation.init();

    document.getElementById("iso-dalton-btn").addEventListener("click", () => this.switchToBackend());

    document.querySelectorAll("#ca-pillbar .pill").forEach((p) => {
      p.addEventListener("click", () => {
        if (p.dataset.tab === "isolation" && !this.started && this.mode === "backend") this.start();
      });
    });
    if (document.getElementById("tab-isolation").style.display !== "none" && this.mode === "backend") {
      this.start();
    }
  },

  start() {
    if (this.started) return;
    this.started = true;
    this.startStream();
    this.poll();
    this.pollTimer = setInterval(() => this.poll(), 3000);
  },

  switchToBackend() {
    this.mode = "backend";
    document.getElementById("iso-canvas").style.display = "none";
    document.getElementById("iso-source-title").textContent = "Dalton's Camera";
    document.getElementById("iso-dalton-btn").classList.add("primary");
    document.getElementById("iso-upload-btn").classList.remove("primary");
    if (!this.started) {
      this.start();
    } else {
      document.getElementById("iso-stream").style.display = "";
    }
    this.updateCaption();
  },

  switchToLocal() {
    this.mode = "local";
    document.getElementById("iso-stream").style.display = "none";
    document.getElementById("iso-placeholder").style.display = "none";
    document.getElementById("iso-canvas").style.display = "";
    document.getElementById("iso-source-title").textContent = "Your Photo";
    document.getElementById("iso-dalton-btn").classList.remove("primary");
    document.getElementById("iso-upload-btn").classList.add("primary");
    LocalIsolation.render(this.current);
    this.updateCaption();
  },

  renderSwatches() {
    const wrap = document.getElementById("iso-swatches");
    if (!wrap) return;
    ISO_COLORS.forEach((c) => {
      const btn = document.createElement("div");
      btn.className = "swatch-btn" + (c.key === this.current ? " active" : "");
      btn.innerHTML = `<span class="dot" style="background:${c.hex}"></span>${c.label}`;
      btn.addEventListener("click", () => this.setColor(c, btn));
      wrap.appendChild(btn);
    });
  },

  startStream() {
    const img = document.getElementById("iso-stream");
    const placeholder = document.getElementById("iso-placeholder");
    const baseUrl = typeof BACKEND_URL !== "undefined" ? BACKEND_URL : "";

    img.onload = () => {
      if (this.mode !== "backend") return;
      img.style.display = "";
      if (placeholder) placeholder.style.display = "none";
    };
    img.onerror = () => {
      if (this.mode !== "backend") return;
      img.style.display = "none";
      if (placeholder) {
        placeholder.style.display = "";
        placeholder.textContent = "Can't reach the video stream — is the Python backend (app.py) running?";
      }
    };
    img.src = `${baseUrl}/video_feed`;
  },

  async setColor(colorObj, btnEl) {
    document.querySelectorAll("#iso-swatches .swatch-btn").forEach((b) => b.classList.remove("active"));
    btnEl.classList.add("active");
    this.current = colorObj.key;
    document.getElementById("iso-status-mode").textContent = colorObj.label;
    this.updateCaption();

    if (this.mode === "local") {
      LocalIsolation.render(colorObj.key);
      return;
    }

    const baseUrl = typeof BACKEND_URL !== "undefined" ? BACKEND_URL : "";
    try {
      const res = await fetch(`${baseUrl}/set_color`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ color: colorObj.key }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        document.getElementById("iso-caption").textContent =
          data.error || "The backend rejected that color.";
      }
    } catch (err) {
      document.getElementById("iso-status-backend").textContent = "Unreachable";
    }
  },

  updateCaption() {
    const colorObj = ISO_COLORS.find((c) => c.key === this.current);
    const caption = document.getElementById("iso-caption");
    if (this.mode === "local") {
      caption.textContent = this.current === "normal"
        ? "Showing your uploaded photo. Pick a color below to isolate it."
        : `Isolating ${colorObj.label} in your photo — everything else is grayscale.`;
    } else {
      caption.textContent = this.current === "normal"
        ? "Showing the normal feed. Pick a color below to isolate it."
        : `Isolating ${colorObj.label} — everything else is grayscale.`;
    }
  },

  async poll() {
    const baseUrl = typeof BACKEND_URL !== "undefined" ? BACKEND_URL : "";
    try {
      const res = await fetch(`${baseUrl}/status`);
      if (!res.ok) throw new Error("bad status");
      const data = await res.json();
      document.getElementById("iso-status-backend").textContent = "Online";
      document.getElementById("iso-status-camera").textContent = data.connected
        ? "Connected"
        : "Disconnected — retrying…";
    } catch (err) {
      document.getElementById("iso-status-backend").textContent = "Unreachable";
      document.getElementById("iso-status-camera").textContent = "Unknown";
    }
  },
};

document.addEventListener("DOMContentLoaded", () => {
  BackendIsolation.init();
});