// =====================================================================
// COLOR ISOLATION — Python backend driven
// =====================================================================
// This tab no longer does any pixel processing in the browser. It:
//   1. Displays the backend's live MJPEG stream (one shared connection
//      to Dalton's ESP32-CAM, processed with OpenCV/NumPy in Python).
//   2. Lets the user pick a color, which POSTs to /set_color so the
//      backend knows which HSV isolation to apply to the next frames.
//   3. Polls /status periodically to show connection health.
//
// See backend/color_processor.py for the actual HSV isolation logic and
// backend/camera.py for the ESP32-CAM connection + reconnection logic.

const ISO_COLORS = [
  { key: "normal", label: "Normal", hex: "#ffffff" },
  { key: "red", label: "Red", hex: "#dc1e1e" },
  { key: "orange", label: "Orange", hex: "#ef8a1c" },
  { key: "yellow", label: "Yellow", hex: "#f2c230" },
  { key: "green", label: "Green", hex: "#1f9254" },
  { key: "blue", label: "Blue", hex: "#2f6fed" },
  { key: "purple", label: "Purple / Pink", hex: "#8a4fe0" },
];

const BackendIsolation = {
  current: "normal",
  pollTimer: null,
  started: false,

  init() {
    this.renderSwatches();

    // Only start the stream/poll once — switching tabs back and forth
    // should not open additional connections to the backend or the
    // ESP32-CAM.
    document.querySelectorAll("#ca-pillbar .pill").forEach((p) => {
      p.addEventListener("click", () => {
        if (p.dataset.tab === "isolation" && !this.started) this.start();
      });
    });
    if (document.getElementById("tab-isolation").style.display !== "none") {
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
    img.onload = () => {
      img.style.display = "";
      if (placeholder) placeholder.style.display = "none";
    };
    img.onerror = () => {
      img.style.display = "none";
      if (placeholder) {
        placeholder.style.display = "";
        placeholder.textContent = "Can't reach the video stream — is the Python backend (app.py) running?";
      }
    };
    // A single <img> pointed at the MJPEG endpoint keeps exactly one
    // connection open to the backend for the lifetime of the page.
    img.src = "/video_feed";
  },

  async setColor(colorObj, btnEl) {
    document.querySelectorAll("#iso-swatches .swatch-btn").forEach((b) => b.classList.remove("active"));
    btnEl.classList.add("active");
    this.current = colorObj.key;
    document.getElementById("iso-status-mode").textContent = colorObj.label;
    document.getElementById("iso-caption").textContent =
      colorObj.key === "normal"
        ? "Showing the normal feed. Pick a color below to isolate it."
        : `Isolating ${colorObj.label} — everything else is grayscale.`;
    try {
      const res = await fetch("/set_color", {
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

  async poll() {
    try {
      const res = await fetch("/status");
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
