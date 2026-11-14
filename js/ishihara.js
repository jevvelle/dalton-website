// Procedurally generated dot plates in the spirit of the Ishihara test.
// These are original generated patterns, not reproductions of official plates.
// Built for a lightweight, non-diagnostic screening demo.

const ISHIHARA_PLATES = [
  { number: "12", options: ["12", "17", "2"] },
  { number: "8", options: ["3", "8", "9"] },
  { number: "29", options: ["70", "29", "26"] },
  { number: "5", options: ["6", "2", "5"] },
  { number: "3", options: ["3", "8", "5"] },
  { number: "6", options: ["8", "6", "5"] },
  { number: "15", options: ["15", "18", "12"] },
  { number: "74", options: ["71", "21", "74"] },
  { number: "45", options: ["54", "45", "48"] },
  { number: "7", options: ["1", "2", "7"] }
];


// Each plate uses a different pair of colors.
// The colors are intentionally similar in brightness and saturation
// to make the number more difficult to distinguish.

const PLATE_PALETTES = [
  {
    bg: ["#87965A", "#8D9C61", "#829054", "#929F68"],
    fig: ["#9A765B", "#947055", "#A07B60", "#8E6B51"]
  },

  {
    bg: ["#6F8F87", "#74958C", "#6A8981", "#7A9991"],
    fig: ["#788A82", "#72847C", "#7D9088", "#6D8078"]
  },

  {
    bg: ["#A19A63", "#A69F69", "#9C955E", "#ABA570"],
    fig: ["#91876A", "#8C8264", "#978D70", "#877D60"]
  },

  {
    bg: ["#82956C", "#879B71", "#7D9067", "#8EA078"],
    fig: ["#8E8068", "#897A63", "#95866F", "#82745E"]
  },

  {
    bg: ["#9B8063", "#A08467", "#967A5D", "#A78A6E"],
    fig: ["#8B8666", "#857F60", "#918C6D", "#7F795B"]
  },

  {
    bg: ["#718C82", "#769188", "#6B867C", "#7C978D"],
    fig: ["#857E76", "#807970", "#8B847C", "#7A736A"]
  },

  {
    bg: ["#938466", "#988A6C", "#8D7E60", "#9E9072"],
    fig: ["#7E876B", "#788163", "#848D71", "#727B5D"]
  },

  {
    bg: ["#7F8998", "#84909E", "#798391", "#8A95A3"],
    fig: ["#85817D", "#807C78", "#8B8783", "#797571"]
  },

  {
    bg: ["#A08E69", "#A5936F", "#9A8762", "#AB9975"],
    fig: ["#8A806C", "#847966", "#908672", "#7E7460"]
  },

  {
    bg: ["#788C68", "#7D926D", "#738663", "#839873"],
    fig: ["#7E7F70", "#797A6B", "#858677", "#737465"]
  }
];


// Convert HEX color to RGB

function hexToRgb(hex) {
  const cleanHex = hex.replace("#", "");

  return {
    r: parseInt(cleanHex.substring(0, 2), 16),
    g: parseInt(cleanHex.substring(2, 4), 16),
    b: parseInt(cleanHex.substring(4, 6), 16)
  };
}


// Convert RGB to HEX

function rgbToHex(r, g, b) {
  return (
    "#" +
    [r, g, b]
      .map((value) =>
        Math.round(value)
          .toString(16)
          .padStart(2, "0")
      )
      .join("")
  );
}


// Slightly change the brightness of a color

function shade(hex, amount) {
  const { r, g, b } = hexToRgb(hex);

  const clamp = (value) =>
    Math.max(0, Math.min(255, value));

  return rgbToHex(
    clamp(r + amount),
    clamp(g + amount),
    clamp(b + amount)
  );
}


// Draw an Ishihara-style plate

function drawIshiharaPlate(
  canvas,
  number,
  plateIndex
) {
  const ctx = canvas.getContext("2d");

  const size = canvas.width;
  const radius = size / 2;

  ctx.clearRect(
    0,
    0,
    size,
    size
  );


  // Get the color palette for this plate

  const palette =
    PLATE_PALETTES[
      plateIndex % PLATE_PALETTES.length
    ];


  // Create an invisible canvas containing
  // the number used as a mask.

  const mask =
    document.createElement("canvas");

  mask.width = size;
  mask.height = size;

  const mctx =
    mask.getContext("2d");


  mctx.fillStyle = "#000";

  mctx.font =
    `bold ${Math.floor(size * 0.62)}px Arial`;

  mctx.textAlign = "center";
  mctx.textBaseline = "middle";


  mctx.fillText(
    number,
    size / 2,
    size / 2 + size * 0.02
  );


  const maskData =
    mctx.getImageData(
      0,
      0,
      size,
      size
    ).data;


  // Check whether a specific coordinate
  // is inside the number.

  function insideDigit(x, y) {
    const index =
      (
        Math.floor(y) * size +
        Math.floor(x)
      ) * 4 + 3;

    return maskData[index] > 100;
  }


  // Generate dots

  const dots = [];

  const attempts = 3000;


  for (
    let i = 0;
    i < attempts;
    i++
  ) {
    const angle =
      Math.random() * Math.PI * 2;

    const distance =
      Math.sqrt(Math.random()) *
      (radius - 6);


    const x =
      radius +
      Math.cos(angle) *
      distance;

    const y =
      radius +
      Math.sin(angle) *
      distance;


    // Slightly varied dot sizes

    const dotRadius =
      3 + Math.random() * 5.5;


    // Prevent too much overlap

    let overlap = false;


    for (
      let j = dots.length - 1;
      j >= Math.max(0, dots.length - 40);
      j--
    ) {
      const dot = dots[j];

      const distanceBetween =
        Math.hypot(
          dot.x - x,
          dot.y - y
        );


      if (
        distanceBetween <
        (dot.r + dotRadius) * 0.72
      ) {
        overlap = true;
        break;
      }
    }


    if (overlap) {
      continue;
    }


    dots.push({
      x,
      y,
      r: dotRadius,
      inDigit: insideDigit(x, y)
    });
  }


  // Draw dots

  dots.forEach((dot) => {
    const colors =
      dot.inDigit
        ? palette.fig
        : palette.bg;


    const baseColor =
      colors[
        Math.floor(
          Math.random() *
          colors.length
        )
      ];


    // Smaller variation keeps the colors
    // visually similar and makes the test harder.

    const finalColor =
      shade(
        baseColor,
        Math.round(
          (Math.random() - 0.5) * 10
        )
      );


    ctx.beginPath();

    ctx.arc(
      dot.x,
      dot.y,
      dot.r,
      0,
      Math.PI * 2
    );


    ctx.fillStyle =
      finalColor;

    ctx.fill();
  });
}



// ========================================
// ISHIHARA TEST
// ========================================

const IshiharaTest = {

  index: 0,

  score: 0,

  answered: false,


  init() {
    this.renderPlate();
  },


  renderPlate() {

    this.answered = false;


    const plate =
      ISHIHARA_PLATES[
        this.index
      ];


    const canvas =
      document.getElementById(
        "ishihara-canvas"
      );


    if (!canvas) {
      return;
    }


    drawIshiharaPlate(
      canvas,
      plate.number,
      this.index
    );


    // Update progress

    const progress =
      document.getElementById(
        "ishihara-progress"
      );


    if (progress) {
      progress.textContent =
        `Plate ${this.index + 1} of ${ISHIHARA_PLATES.length}`;
    }


    // Get answer container

    const optionsWrap =
      document.getElementById(
        "ishihara-options"
      );


    if (!optionsWrap) {
      return;
    }


    optionsWrap.innerHTML = "";


    // Remove previous feedback

    const oldFeedback =
      document.getElementById(
        "ishihara-feedback-line"
      );


    if (oldFeedback) {
      oldFeedback.remove();
    }


    // Create answer buttons

    plate.options.forEach(
      (option) => {

        const button =
          document.createElement("div");


        button.className =
          "pill";


        button.style.flex =
          "none";


        button.textContent =
          option;


        button.addEventListener(
          "click",
          () =>
            this.answer(
              option,
              button
            )
        );


        optionsWrap.appendChild(
          button
        );
      }
    );
  },


  answer(choice, buttonElement) {

    if (this.answered) {
      return;
    }


    this.answered = true;


    const plate =
      ISHIHARA_PLATES[
        this.index
      ];


    const correct =
      choice === plate.number;


    if (correct) {
      this.score++;
    }


    // Disable all options

    document
      .querySelectorAll(
        "#ishihara-options .pill"
      )
      .forEach(
        (button) => {
          button.style.pointerEvents =
            "none";
        }
      );


    // Highlight selected answer

    buttonElement.classList.add(
      "active"
    );


    // Create feedback

    const feedback =
      document.createElement("div");


    feedback.id =
      "ishihara-feedback-line";


    feedback.className =
      "ishihara-feedback " +
      (
        correct
          ? "correct"
          : "wrong"
      );


    feedback.textContent =
      correct
        ? "Correct!"
        : `Not quite — most people see ${plate.number}.`;


    const options =
      document.getElementById(
        "ishihara-options"
      );


    options.after(
      feedback
    );


    // Automatically move to next plate

    setTimeout(
      () => this.next(),
      1100
    );
  },


  next() {

    this.index++;


    // Check if test is finished

    if (
      this.index >=
      ISHIHARA_PLATES.length
    ) {
      this.showResult();
      return;
    }


    this.renderPlate();
  },


  // ========================================
  // SCORE-BASED RESULT MESSAGE
  // ========================================

  getResultMessage() {

    const score = this.score;


    if (score <= 4) {

      return "Your score suggests that you may have difficulty distinguishing some colors. Consider getting your color vision checked by an eye care professional for a more complete assessment.";

    }


    if (score <= 7) {

      return "You missed several plates. Consider getting your color vision checked by an eye care professional, especially if you regularly have difficulty telling colors apart.";

    }


    if (score <= 9) {

      return "You identified most of the plates correctly. If you still regularly have difficulty distinguishing colors, consider getting your color vision checked by an eye care professional.";

    }


    return "You identified all of the plates correctly. If you still experience difficulty distinguishing colors, consider getting a full test from an eye care professional.";
  },


  // ========================================
  // SHOW RESULT
  // ========================================

  showResult() {

    const card =
      document.getElementById(
        "ishihara-card"
      );


    if (!card) {
      return;
    }


    card.innerHTML = `
      <div class="ishihara-result">

        <h2
          style="
            font-size:24px;
            margin-bottom:10px;
          "
        >
          You matched ${this.score}
          of ${ISHIHARA_PLATES.length}
          plates.
        </h2>

        <p
          class="section-desc"
          style="
            margin:0 auto 20px;
            max-width:48ch;
          "
        >
          ${this.getResultMessage()}
        </p>

        <p
          class="section-desc"
          style="
            margin:0 auto 20px;
            max-width:48ch;
            font-size:13px;
            opacity:0.8;
          "
        >
          This is a simplified screening demo
          and not a medical diagnosis.
        </p>

        <button
          class="btn primary"
          id="ishihara-retry"
        >
          Try Again
        </button>

      </div>
    `;


    // Retry button

    document
      .getElementById(
        "ishihara-retry"
      )
      .addEventListener(
        "click",
        () => {

          this.index = 0;

          this.score = 0;

          this.answered = false;


          // Rebuild test interface

          card.innerHTML = `
            <div
              class="ishihara-progress"
              id="ishihara-progress"
            ></div>

            <div
              class="ishihara-plate-wrap"
            >
              <canvas
                id="ishihara-canvas"
                width="280"
                height="280"
                class="ishihara-plate"
              ></canvas>
            </div>

            <div
              class="ishihara-options"
              id="ishihara-options"
            ></div>
          `;


          this.renderPlate();
        }
      );
  }
};


// ========================================
// START TEST
// ========================================

document.addEventListener(
  "DOMContentLoaded",
  () => {
    IshiharaTest.init();
  }
);