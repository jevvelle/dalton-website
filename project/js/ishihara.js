// Procedurally generated dot plates in the spirit of the Ishihara test.
// These are original generated patterns (not reproductions of the copyrighted
// official plates) built for a lightweight, non-diagnostic screening demo.

const ISHIHARA_PLATES = [
  { number: "12", options: ["12", "17", "2", "None"] },
  { number: "8", options: ["3", "8", "9", "None"] },
  { number: "29", options: ["29", "70", "26", "None"] },
  { number: "5", options: ["5", "2", "6", "None"] },
  { number: "3", options: ["3", "8", "5", "None"] },
  { number: "6", options: ["6", "8", "5", "None"] },
];

const BG_PALETTE = ["#8fae4c", "#a6c25a", "#7a9a3f", "#b8cf72", "#93ab55"];
const FIG_PALETTE = ["#e07b3e", "#d96a2b", "#e8935a", "#c85f24", "#eea470"];

function shade(hex, amt) {
  const { r, g, b } = hexToRgb(hex);
  const clamp = (v) => Math.max(0, Math.min(255, v));
  return rgbToHex(clamp(r + amt), clamp(g + amt), clamp(b + amt));
}

function drawIshiharaPlate(canvas, number) {
  const ctx = canvas.getContext("2d");
  const size = canvas.width;
  const radius = size / 2;
  ctx.clearRect(0, 0, size, size);

  // Render the digit to an offscreen canvas to build a hit-mask.
  const mask = document.createElement("canvas");
  mask.width = size; mask.height = size;
  const mctx = mask.getContext("2d");
  mctx.fillStyle = "#000";
  mctx.font = `bold ${Math.floor(size * 0.62)}px Arial`;
  mctx.textAlign = "center";
  mctx.textBaseline = "middle";
  mctx.fillText(number, size / 2, size / 2 + size * 0.02);
  const maskData = mctx.getImageData(0, 0, size, size).data;

  function insideDigit(x, y) {
    const idx = (Math.floor(y) * size + Math.floor(x)) * 4 + 3;
    return maskData[idx] > 100;
  }

  // Scatter dots across the circular plate.
  const dots = [];
  const attempts = 2600;
  for (let i = 0; i < attempts; i++) {
    const a = Math.random() * Math.PI * 2;
    const dist = Math.sqrt(Math.random()) * (radius - 6);
    const x = radius + Math.cos(a) * dist;
    const y = radius + Math.sin(a) * dist;
    const r = 3 + Math.random() * 5.5;
    let overlap = false;
    for (let j = dots.length - 1; j >= Math.max(0, dots.length - 40); j--) {
      const d = dots[j];
      const dd = Math.hypot(d.x - x, d.y - y);
      if (dd < (d.r + r) * 0.72) { overlap = true; break; }
    }
    if (overlap) continue;
    dots.push({ x, y, r, inDigit: insideDigit(x, y) });
  }

  dots.forEach((d) => {
    const palette = d.inDigit ? FIG_PALETTE : BG_PALETTE;
    const base = palette[Math.floor(Math.random() * palette.length)];
    const color = shade(base, Math.round((Math.random() - 0.5) * 20));
    ctx.beginPath();
    ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
  });
}

const IshiharaTest = {
  index: 0,
  score: 0,
  answered: false,

  init() {
    this.renderPlate();
  },

  renderPlate() {
    this.answered = false;
    const plate = ISHIHARA_PLATES[this.index];
    const canvas = document.getElementById("ishihara-canvas");
    drawIshiharaPlate(canvas, plate.number);

    document.getElementById("ishihara-progress").textContent =
      `Plate ${this.index + 1} of ${ISHIHARA_PLATES.length}`;

    const optionsWrap = document.getElementById("ishihara-options");
    optionsWrap.innerHTML = "";
    let feedback = document.getElementById("ishihara-feedback-line");
    if (feedback) feedback.remove();

    plate.options.forEach((opt) => {
      const btn = document.createElement("div");
      btn.className = "pill";
      btn.style.flex = "none";
      btn.textContent = opt;
      btn.addEventListener("click", () => this.answer(opt, btn));
      optionsWrap.appendChild(btn);
    });
  },

  answer(choice, btnEl) {
    if (this.answered) return;
    this.answered = true;
    const plate = ISHIHARA_PLATES[this.index];
    const correct = choice === plate.number;
    if (correct) this.score++;

    document.querySelectorAll("#ishihara-options .pill").forEach((p) => (p.style.pointerEvents = "none"));
    btnEl.classList.add("active");

    const feedback = document.createElement("div");
    feedback.id = "ishihara-feedback-line";
    feedback.className = "ishihara-feedback " + (correct ? "correct" : "wrong");
    feedback.textContent = correct
      ? "Correct!"
      : `Not quite — most people see ${plate.number}.`;
    document.getElementById("ishihara-options").after(feedback);

    setTimeout(() => this.next(), 1100);
  },

  next() {
    this.index++;
    if (this.index >= ISHIHARA_PLATES.length) {
      this.showResult();
      return;
    }
    this.renderPlate();
  },

  showResult() {
    const card = document.getElementById("ishihara-card");
    card.innerHTML = `
      <div class="ishihara-result">
        <h2 style="font-size:24px; margin-bottom:10px;">You matched ${this.score} of ${ISHIHARA_PLATES.length} plates.</h2>
        <p class="section-desc" style="margin:0 auto 20px; max-width:48ch;">
          This is a simplified screening demo, not a medical diagnosis. If you regularly have
          trouble telling colors apart, consider getting a full test from an eye care professional.
        </p>
        <button class="btn primary" id="ishihara-retry">Try Again</button>
      </div>`;
    document.getElementById("ishihara-retry").addEventListener("click", () => {
      this.index = 0;
      this.score = 0;
      card.innerHTML = `
        <div class="ishihara-progress" id="ishihara-progress"></div>
        <div class="ishihara-plate-wrap">
          <canvas id="ishihara-canvas" width="280" height="280" class="ishihara-plate"></canvas>
        </div>
        <div class="ishihara-options" id="ishihara-options"></div>`;
      this.renderPlate();
    });
  },
};

document.addEventListener("DOMContentLoaded", () => {
  IshiharaTest.init();
});
