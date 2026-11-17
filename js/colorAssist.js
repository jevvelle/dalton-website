// ---------- Shared color palette ----------
const PALETTE = [
  { name: "Red", hex: "#dc1e1e" },
  { name: "Orange", hex: "#ef8a1c" },
  { name: "Yellow", hex: "#f2c230" },
  { name: "Green", hex: "#1f9254" },
  { name: "Blue", hex: "#2f6fed" },
  { name: "Violet", hex: "#8a4fe0" },
  { name: "Pink", hex: "#e0468f" },
  { name: "White", hex: "#ffffff" },
  { name: "Black", hex: "#1c1a17" },
];

function hexToRgb(hex) {
  const h = hex.replace("#", "");
  return {
    r: parseInt(h.substring(0, 2), 16),
    g: parseInt(h.substring(2, 4), 16),
    b: parseInt(h.substring(4, 6), 16),
  };
}
function rgbToHex(r, g, b) {
  const c = (v) => v.toString(16).padStart(2, "0");
  return "#" + c(r) + c(g) + c(b);
}
function colorDistance(c1, c2) {
  return Math.sqrt((c1.r - c2.r) ** 2 + (c1.g - c2.g) ** 2 + (c1.b - c2.b) ** 2);
}
function luminance(r, g, b) {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}
function closestPaletteColor(rgb) {
  let best = PALETTE[0];
  let bestDist = Infinity;
  PALETTE.forEach((p) => {
    const d = colorDistance(rgb, hexToRgb(p.hex));
    if (d < bestDist) { bestDist = d; best = p; }
  });
  return best;
}
function fitCanvasToImage(canvas, img, maxWidth) {
  const scale = Math.min(1, maxWidth / img.width);
  canvas.width = Math.round(img.width * scale);
  canvas.height = Math.round(img.height * scale);
}
function fitCanvasToSource(canvas, source, maxWidth) {
  const w = source.videoWidth || source.naturalWidth || source.width;
  const h = source.videoHeight || source.naturalHeight || source.height;
  const scale = Math.min(1, maxWidth / w);
  canvas.width = Math.round(w * scale);
  canvas.height = Math.round(h * scale);
}

// ---------- Central upload dispatcher ----------
window.onImageUploaded = function (target, img) {
  AIAssist.setImage(img);
  Picker.setImage(img);
  if (typeof LocalIsolation !== "undefined") LocalIsolation.setImage(img);
};

// ---------- Shared Dalton ESP32-CAM feed (unprocessed) ----------
const DaltonCam = {
  img: null,
  started: false,
  connected: false,
  readyCallbacks: [],
  statusCallbacks: [],

  ensure() {
    if (this.img) return this.img;
    this.img = document.createElement("img");
    this.img.crossOrigin = "anonymous";
    this.img.style.display = "none";
    this.img.onload = () => {
      this.connected = true;
      this._notifyStatus(true);
      this._flushReady();
    };
    this.img.onerror = () => {
      this.connected = false;
      this._notifyStatus(false);
    };
    document.body.appendChild(this.img);
    return this.img;
  },

  start() {
    this.ensure();
    if (this.started && this.connected) return;
    this.started = true;
    const baseUrl = typeof BACKEND_URL !== "undefined" ? BACKEND_URL : "";
    this.img.src = `${baseUrl}/video_feed_raw?t=${Date.now()}`;
  },

  getImage() {
    this.start();
    return this.img;
  },

  isReady() {
    return this.connected && this.img && this.img.naturalWidth > 0;
  },

  onReady(cb) {
    if (this.isReady()) cb();
    else this.readyCallbacks.push(cb);
  },

  onStatus(cb) {
    this.statusCallbacks.push(cb);
    cb(this.connected);
  },

  _flushReady() {
    this.readyCallbacks.forEach((cb) => cb());
    this.readyCallbacks = [];
  },
  _notifyStatus(connected) {
    this.statusCallbacks.forEach((cb) => cb(connected));
  },
};

// =====================================================================
// AI COLOR ASSIST — vision simulation
// =====================================================================
const VISION_MATRICES = {
  protanomaly: [0.817, 0.183, 0, 0.333, 0.667, 0, 0, 0.125, 0.875],
  deuteranomaly: [0.8, 0.2, 0, 0.258, 0.742, 0, 0, 0.142, 0.858],
  tritanomaly: [0.967, 0.033, 0, 0, 0.733, 0.267, 0, 0.183, 0.817],
  protanopia: [0.567, 0.433, 0, 0.558, 0.442, 0, 0, 0.242, 0.758],
  deuteranopia: [0.625, 0.375, 0, 0.7, 0.3, 0, 0, 0.3, 0.7],
  tritanopia: [0.95, 0.05, 0, 0, 0.433, 0.567, 0, 0.475, 0.525],
  achromatopsia: [0.299, 0.587, 0.114, 0.299, 0.587, 0.114, 0.299, 0.587, 0.114],
  bluecone: [0.01775, 0.10945, 0.87262, 0.01775, 0.10945, 0.87262, 0.01775, 0.10945, 0.87262],
};
const VISION_INFO = {
  protanomaly: {
    title: "Protanomaly",
    text: "A mild form of red-cone deficiency. Reds, oranges, and greens look muted and can shift toward each other, though color perception is only partly affected.",
  },
  deuteranomaly: {
    title: "Deuteranomaly",
    text: "The most common color vision difference, caused by a shifted green-cone sensitivity. Greens and reds blend together more than usual, especially in dim light.",
  },
  tritanomaly: {
    title: "Tritanomaly",
    text: "A rare, mild blue-cone deficiency. Blues can look greener and yellows can look pinker, though most other colors stay close to normal.",
  },
  protanopia: {
    title: "Protanopia",
    text: "Missing red-sensing cones entirely. Reds appear darker and can be confused with black, green, or brown, and purple can look more like blue.",
  },
  deuteranopia: {
    title: "Deuteranopia",
    text: "Missing green-sensing cones entirely, the most common full dichromatic type. Reds and greens both shift toward similar brownish-yellow tones.",
  },
  tritanopia: {
    title: "Tritanopia",
    text: "Missing blue-sensing cones entirely, much rarer than the other two. Blue and yellow become the hardest pair to tell apart, and blue can look green.",
  },
  achromatopsia: {
    title: "Achromatopsia",
    text: "Complete color blindness — the world is seen only in shades of gray, often along with heightened sensitivity to bright light.",
  },
  bluecone: {
    title: "Blue Cone Monochromacy",
    text: "Only the blue-sensing cones function; red and green cones are absent. Vision is nearly grayscale with just a faint sense of blue-yellow contrast.",
  },
};

const AIAssist = {
  source: null,
  liveMode: null,
  stream: null,
  video: null,
  rafId: null,
  _lastRender: 0,
  vision: "protanomaly",
  canvasNormal: null,
  canvasSimulated: null,

  init() {
    this.canvasNormal = document.getElementById("ai-canvas-normal");
    this.canvasSimulated = document.getElementById("ai-canvas-simulated");
    this.video = document.getElementById("ai-camera-video");

    document.querySelectorAll("#tab-ai .vision-option").forEach((p) => {
      p.addEventListener("click", () => {
        document.querySelectorAll("#tab-ai .vision-option").forEach((x) => x.classList.remove("active"));
        p.classList.add("active");
        this.vision = p.dataset.vision;
        this.updateExplainPanel();
        if (!this.liveMode) this.render();
      });
    });

    document.getElementById("ai-camera-btn").addEventListener("click", () => {
      if (this.liveMode === "webcam") this.stopLive();
      else this.startWebcam();
    });

    document.getElementById("ai-dalton-btn").addEventListener("click", () => {
      if (this.liveMode === "dalton") this.stopLive();
      else this.startDaltonCam();
    });

    document.querySelectorAll("#ca-pillbar .pill").forEach((p) => {
      p.addEventListener("click", () => {
        if (p.dataset.tab !== "ai") this.stopLive();
      });
    });

    this.updateExplainPanel();
  },

  async startWebcam() {
    const statusEl = document.getElementById("ai-upload-status");
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      statusEl.textContent = "Live camera isn't supported in this browser.";
      return;
    }
    this.stopLive();
    try {
      statusEl.textContent = "Requesting camera access…";
      this.stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" }, audio: false });
      this.video.srcObject = this.stream;
      await this.video.play();

      this.source = this.video;
      this.liveMode = "webcam";
      document.getElementById("ai-camera-btn").textContent = "Stop Camera";
      document.getElementById("ai-camera-btn").classList.remove("primary");
      statusEl.textContent = "Live camera active.";
      this.hidePlaceholders();
      fitCanvasToSource(this.canvasNormal, this.video, 420);
      fitCanvasToSource(this.canvasSimulated, this.video, 420);
      this.loop();
    } catch (err) {
      this.liveMode = null;
      statusEl.textContent = "Camera access was denied or unavailable.";
    }
  },

  startDaltonCam() {
    this.stopLive();
    const statusEl = document.getElementById("ai-upload-status");
    statusEl.textContent = "Connecting to Dalton's camera…";
    this.source = DaltonCam.getImage();
    this.liveMode = "dalton";
    document.getElementById("ai-dalton-btn").textContent = "Stop Dalton's Camera";

    DaltonCam.onStatus((connected) => {
      if (this.liveMode !== "dalton") return;
      statusEl.textContent = connected
        ? "Streaming Dalton's camera."
        : "Can't reach Dalton's camera — check that the backend (app.py) is running and the ESP32-CAM is connected.";
    });
    DaltonCam.onReady(() => {
      if (this.liveMode !== "dalton") return;
      this.hidePlaceholders();
      fitCanvasToSource(this.canvasNormal, this.source, 420);
      fitCanvasToSource(this.canvasSimulated, this.source, 420);
      this.loop();
    });
  },

  hidePlaceholders() {
    document.getElementById("ai-placeholder-normal").style.display = "none";
    document.getElementById("ai-placeholder-simulated").style.display = "none";
  },

  stopLive() {
    if (this.rafId) cancelAnimationFrame(this.rafId);
    this.rafId = null;
    if (this.liveMode === "webcam" && this.stream) {
      this.stream.getTracks().forEach((t) => t.stop());
      this.stream = null;
    }
    if (this.liveMode === "webcam") {
      const btn = document.getElementById("ai-camera-btn");
      btn.textContent = "Live Camera";
      btn.classList.add("primary");
    }
    if (this.liveMode === "dalton") {
      document.getElementById("ai-dalton-btn").textContent = "Dalton's Camera";
    }
    if (this.liveMode) {
      document.getElementById("ai-upload-status").textContent = "Camera stopped.";
      document.getElementById("ai-placeholder-normal").style.display = "";
      document.getElementById("ai-placeholder-simulated").style.display = "";
    }
    this.liveMode = null;
    this.source = null;
  },

  loop() {
    if (!this.liveMode) return;
    const now = performance.now();
    if (!this._lastRender || now - this._lastRender >= 65) {
      this.render();
      this._lastRender = now;
    }
    this.rafId = requestAnimationFrame(() => this.loop());
  },

  setImage(img) {
    this.stopLive();
    this.source = img;
    document.getElementById("ai-upload-status").textContent = "Image uploaded.";
    this.hidePlaceholders();
    fitCanvasToSource(this.canvasNormal, img, 420);
    fitCanvasToSource(this.canvasSimulated, img, 420);
    this.render();
  },

  updateExplainPanel() {
    const info = VISION_INFO[this.vision];
    const panel = document.getElementById("ai-explain-panel");
    panel.querySelector("h3").textContent = info.title;
    panel.querySelector("p").textContent = info.text;
    document.getElementById("ai-vision-badge").textContent = info.title;
  },

  render() {
    if (!this.source) return;
    const normalCtx = this.canvasNormal.getContext("2d");
    normalCtx.drawImage(this.source, 0, 0, this.canvasNormal.width, this.canvasNormal.height);

    const simCtx = this.canvasSimulated.getContext("2d");
    simCtx.drawImage(this.source, 0, 0, this.canvasSimulated.width, this.canvasSimulated.height);
    const m = VISION_MATRICES[this.vision];
    const data = simCtx.getImageData(0, 0, this.canvasSimulated.width, this.canvasSimulated.height);
    const d = data.data;
    for (let i = 0; i < d.length; i += 4) {
      const r = d[i], g = d[i + 1], b = d[i + 2];
      d[i] = m[0] * r + m[1] * g + m[2] * b;
      d[i + 1] = m[3] * r + m[4] * g + m[5] * b;
      d[i + 2] = m[6] * r + m[7] * g + m[8] * b;
    }
    simCtx.putImageData(data, 0, 0);
  },
};

// =====================================================================
// COLOR PICKER — eyedropper
// =====================================================================
const Picker = {
  source: null,
  liveMode: null,
  rafId: null,
  _lastRender: 0,
  canvas: null,
  recents: [],

  init() {
    this.canvas = document.getElementById("pick-canvas");
    const box = document.getElementById("pick-canvas-box");
    const cursor = document.getElementById("eyedropper");

    document.getElementById("pick-dalton-btn").addEventListener("click", () => {
      if (this.liveMode === "dalton") this.stopLive();
      else this.startDaltonCam();
    });

    document.querySelectorAll("#ca-pillbar .pill").forEach((p) => {
      p.addEventListener("click", () => {
        if (p.dataset.tab !== "picker") this.stopLive();
      });
    });

    box.addEventListener("mousemove", (e) => {
      if (!this.source) return;
      const rect = this.canvas.getBoundingClientRect();
      const x = Math.floor(e.clientX - rect.left);
      const y = Math.floor(e.clientY - rect.top);
      if (x < 0 || y < 0 || x >= this.canvas.width || y >= this.canvas.height) return;

      cursor.style.display = "block";
      const boxRect = box.getBoundingClientRect();
      cursor.style.left = (e.clientX - boxRect.left) + "px";
      cursor.style.top = (e.clientY - boxRect.top) + "px";

      const ctx = this.canvas.getContext("2d");
      const pixel = ctx.getImageData(x, y, 1, 1).data;
      this.showSample(pixel[0], pixel[1], pixel[2]);
    });
    box.addEventListener("mouseleave", () => { cursor.style.display = "none"; });
    box.addEventListener("click", () => {
      const hex = document.getElementById("pick-hex").textContent;
      if (hex && hex !== "—") this.addRecent(hex);
    });
  },

  startDaltonCam() {
    this.stopLive();
    document.getElementById("pick-caption").textContent = "Connecting to Dalton's camera…";
    this.source = DaltonCam.getImage();
    this.liveMode = "dalton";
    document.getElementById("pick-dalton-btn").textContent = "Stop Dalton's Camera";

    DaltonCam.onStatus((connected) => {
      if (this.liveMode !== "dalton") return;
      document.getElementById("pick-caption").textContent = connected
        ? "Move over the live feed to sample a color."
        : "Can't reach Dalton's camera — check that the backend (app.py) is running and the ESP32-CAM is connected.";
    });
    DaltonCam.onReady(() => {
      if (this.liveMode !== "dalton") return;
      document.getElementById("pick-placeholder").style.display = "none";
      fitCanvasToSource(this.canvas, this.source, 560);
      this.loop();
    });
  },

  stopLive() {
    if (this.rafId) cancelAnimationFrame(this.rafId);
    this.rafId = null;
    if (this.liveMode === "dalton") {
      document.getElementById("pick-dalton-btn").textContent = "Dalton's Camera";
    }
    this.liveMode = null;
  },

  loop() {
    if (this.liveMode !== "dalton") return;
    const now = performance.now();
    if (!this._lastRender || now - this._lastRender >= 65) {
      const ctx = this.canvas.getContext("2d");
      ctx.drawImage(this.source, 0, 0, this.canvas.width, this.canvas.height);
      this._lastRender = now;
    }
    this.rafId = requestAnimationFrame(() => this.loop());
  },

  setImage(img) {
    this.stopLive();
    this.source = img;
    document.getElementById("pick-placeholder").style.display = "none";
    document.getElementById("pick-caption").textContent = "Move over the image to sample a color.";
    fitCanvasToSource(this.canvas, img, 560);
    const ctx = this.canvas.getContext("2d");
    ctx.drawImage(img, 0, 0, this.canvas.width, this.canvas.height);
  },

  showSample(r, g, b) {
    const hex = rgbToHex(r, g, b);
    document.getElementById("pick-sample-swatch").style.background = hex;
    document.getElementById("pick-hex").textContent = hex;
    document.getElementById("pick-rgb").textContent = `${r}, ${g}, ${b}`;
    document.getElementById("pick-name").textContent = closestPaletteColor({ r, g, b }).name;
  },

  addRecent(hex) {
    if (this.recents.includes(hex)) return;
    this.recents.unshift(hex);
    this.recents = this.recents.slice(0, 8);
    const wrap = document.getElementById("pick-recent");
    wrap.innerHTML = "";
    this.recents.forEach((h) => {
      const dot = document.createElement("div");
      dot.className = "recent-dot";
      dot.style.background = h;
      dot.title = h;
      wrap.appendChild(dot);
    });
  },
};

// =====================================================================
// ACTIVITIES — color mixing
// =====================================================================
const MIX_COMBOS = [
  ["Red", "Yellow", "Orange", "#ef8a1c"],
  ["Yellow", "Blue", "Green", "#1f9254"],
  ["Red", "Blue", "Purple", "#7a3fbf"],
  ["Red", "White", "Pink", "#ea7fae"],
  ["Red", "Black", "Maroon", "#6e1616"],
  ["Yellow", "White", "Light Yellow", "#f7de7a"],
  ["Yellow", "Black", "Olive", "#6b6b1f"],
  ["Blue", "White", "Light Blue", "#a9c5f5"],
  ["Blue", "Black", "Navy", "#142a5c"],
  ["Red", "Green", "Brown", "#7a4a23"],
  ["Green", "White", "Mint", "#b9e8d3"],
  ["Green", "Black", "Dark Green", "#123d24"],
  ["Orange", "Blue", "Brown", "#7a4a23"],
  ["Violet", "White", "Lavender", "#d9c6f5"],
  ["Violet", "Black", "Dark Purple", "#3d1f5c"],
  ["Pink", "White", "Light Pink", "#f6c9de"],
  ["Pink", "Black", "Dusty Rose", "#b5697c"],
  ["White", "Black", "Gray", "#9c9890"],
];

function findCombo(nameA, nameB) {
  return MIX_COMBOS.find(
    ([a, b]) => (a === nameA && b === nameB) || (a === nameB && b === nameA)
  );
}
function isLightHex(hex) {
  const { r, g, b } = hexToRgb(hex);
  return luminance(r, g, b) > 170;
}

const Activities = {
  slotA: null,
  slotB: null,

  init() {
    const order = ["Red", "Yellow", "Blue", "Green", "Violet", "Orange", "Pink", "White", "Black"];
    const wrap = document.getElementById("mix-circles");
    order.forEach((name) => {
      const color = PALETTE.find((p) => p.name === name);
      const el = document.createElement("div");
      el.className = "circle-swatch " + (isLightHex(color.hex) ? "dark-text" : "light-text");
      el.style.background = color.hex;
      el.textContent = name;
      el.addEventListener("click", () => this.pick(color));
      wrap.appendChild(el);
    });

    const comboGrid = document.getElementById("combo-grid");
    MIX_COMBOS.forEach(([a, b, resultName, resultHex]) => {
      const colorA = PALETTE.find((p) => p.name === a);
      const colorB = PALETTE.find((p) => p.name === b);
      const chip = document.createElement("div");
      chip.className = "combo-chip";
      chip.innerHTML = `
        <span class="mini-dot" style="background:${colorA.hex}"></span>${a}
        <span style="color:var(--ink-soft);">+</span>
        <span class="mini-dot" style="background:${colorB.hex}"></span>${b}
        <span style="color:var(--ink-soft);">=</span>
        <span class="mini-dot" style="background:${resultHex}"></span>${resultName}`;
      comboGrid.appendChild(chip);
    });
  },

  pick(color) {
    if (!this.slotA || (this.slotA && this.slotB)) {
      this.slotA = color;
      this.slotB = null;
      this.updateSlot("a", color);
      this.updateSlot("b", null);
      this.updateResult(null, null);
      return;
    }
    this.slotB = color;
    this.updateSlot("b", color);
    this.computeResult();
  },

  updateSlot(which, color) {
    const circle = document.getElementById(`mix-slot-${which}`);
    const label = document.getElementById(`mix-label-${which}`);
    if (color) {
      circle.classList.add("filled");
      circle.style.background = color.hex;
      label.textContent = color.name;
    } else {
      circle.classList.remove("filled");
      circle.style.background = "";
      label.textContent = "Pick a color";
    }
  },

  computeResult() {
    const combo = findCombo(this.slotA.name, this.slotB.name);
    const resultCircle = document.getElementById("mix-slot-result");
    const resultLabel = document.getElementById("mix-label-result");
    if (combo) {
      resultCircle.classList.add("filled");
      resultCircle.style.background = combo[3];
      resultLabel.textContent = combo[2];
    } else {
      const ra = hexToRgb(this.slotA.hex), rb = hexToRgb(this.slotB.hex);
      const blend = rgbToHex(
        Math.round((ra.r + rb.r) / 2),
        Math.round((ra.g + rb.g) / 2),
        Math.round((ra.b + rb.b) / 2)
      );
      resultCircle.classList.add("filled");
      resultCircle.style.background = blend;
      resultLabel.textContent = "Custom Blend";
    }
  },

  updateResult(hex, label) {
    const resultCircle = document.getElementById("mix-slot-result");
    const resultLabel = document.getElementById("mix-label-result");
    if (hex) {
      resultCircle.classList.add("filled");
      resultCircle.style.background = hex;
    } else {
      resultCircle.classList.remove("filled");
      resultCircle.style.background = "";
    }
    resultLabel.textContent = label || "?";
  },
};

document.addEventListener("DOMContentLoaded", () => {
  AIAssist.init();
  Picker.init();
  Activities.init();
});