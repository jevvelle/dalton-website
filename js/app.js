// ---------- Backend Tunnel Configuration ----------
const BACKEND_URL = "https://accommodation-tested-resolution-miracle.trycloudflare.com";

// ---------- Simple page router ----------
const pages = ["home", "colorassist", "ishihara", "about"];

function showPage(name) {
  pages.forEach((p) => {
    const el = document.getElementById("page-" + p);
    if (el) el.style.display = p === name ? "" : "none";
  });
  document.querySelectorAll(".topnav a").forEach((a) => {
    a.classList.toggle("active", a.dataset.page === name);
  });
  document.querySelectorAll(".sidebar-link").forEach((a) => {
    a.classList.toggle("active", a.dataset.page === name);
  });
  window.scrollTo({ top: 0, behavior: "instant" in window ? "instant" : "auto" });
}

document.querySelectorAll("[data-page]").forEach((el) => {
  el.addEventListener("click", () => showPage(el.dataset.page));
});
document.querySelectorAll("[data-goto]").forEach((el) => {
  el.addEventListener("click", () => showPage(el.dataset.goto));
});

// ---------- Color Assist pill tabs ----------
const caTabs = ["ai", "picker", "isolation", "activities", "explanation"];

function showCaTab(name) {
  caTabs.forEach((t) => {
    const el = document.getElementById("tab-" + t);
    if (el) el.style.display = t === name ? "" : "none";
  });
  document.querySelectorAll("#ca-pillbar .pill").forEach((p) => {
    p.classList.toggle("active", p.dataset.tab === name);
  });
}

document.querySelectorAll("#ca-pillbar .pill").forEach((p) => {
  p.addEventListener("click", () => showCaTab(p.dataset.tab));
});

// ---------- Shared file input dispatcher ----------
const fileInput = document.getElementById("file-input");
let pendingUploadTarget = null;

function requestUpload(targetKey) {
  pendingUploadTarget = targetKey;
  if (fileInput) {
    fileInput.value = "";
    fileInput.click();
  }
}

if (fileInput) {
  fileInput.addEventListener("change", (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file || !pendingUploadTarget) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new Image();
      img.onload = () => {
        if (typeof window.onImageUploaded === "function") {
          window.onImageUploaded(pendingUploadTarget, img);
        }
      };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
  });
}

const aiUploadBtn = document.getElementById("ai-upload-btn");
if (aiUploadBtn) aiUploadBtn.addEventListener("click", () => requestUpload("ai"));

const pickUploadBtn = document.getElementById("pick-upload-btn");
if (pickUploadBtn) pickUploadBtn.addEventListener("click", () => requestUpload("picker"));

const isoUploadBtn = document.getElementById("iso-upload-btn");
if (isoUploadBtn) isoUploadBtn.addEventListener("click", () => requestUpload("isolation"));


// ---------- Floating Dalton AI Bottom-Right Widget Handler ----------
async function sendToDaltonAI(userPrompt) {
  if (!userPrompt || !userPrompt.trim()) return;

  const chatHistory = document.getElementById("dalton-chat-history");
  if (!chatHistory) return;

  // 1. Append User Message
  const userBubble = document.createElement("div");
  userBubble.className = "chat-msg user-msg";
  userBubble.innerText = userPrompt;
  chatHistory.appendChild(userBubble);

  // 2. Append Loading Placeholder
  const aiBubble = document.createElement("div");
  aiBubble.className = "chat-msg ai-msg";
  aiBubble.innerHTML = "<em>Analyzing frame...</em>";
  chatHistory.appendChild(aiBubble);
  chatHistory.scrollTop = chatHistory.scrollHeight;

  // Extract base64 frame data from canvas if available
  let uploadedImageData = null;
  const activeCanvas = document.getElementById("ai-canvas-normal") || document.getElementById("pick-canvas");
  if (activeCanvas && activeCanvas.width > 0) {
    uploadedImageData = activeCanvas.toDataURL("image/jpeg", 0.85);
  }

  try {
    const res = await fetch(`${BACKEND_URL}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt: userPrompt,
        include_image: true,
        image_data: uploadedImageData
      })
    });

    const data = await res.json();
    if (data.ok && data.reply) {
      aiBubble.innerText = data.reply;
    } else {
      aiBubble.innerText = "Error: " + (data.error || "Unable to reach Dalton AI");
    }
  } catch (err) {
    console.error("AI Chat Error:", err);
    aiBubble.innerText = "Failed to communicate with backend.";
  }

  chatHistory.scrollTop = chatHistory.scrollHeight;
}

document.addEventListener("DOMContentLoaded", () => {
  const triggerBtn = document.getElementById("dalton-widget-trigger");
  const widgetCard = document.getElementById("dalton-widget-card");
  const closeBtn = document.getElementById("dalton-close-btn");
  const expandBtn = document.getElementById("dalton-expand-btn");
  const sendBtn = document.getElementById("ai-send-btn");
  const chatInput = document.getElementById("ai-chat-input");

  // Open Popover
  if (triggerBtn && widgetCard) {
    triggerBtn.addEventListener("click", () => {
      widgetCard.style.display = "flex";
      triggerBtn.style.display = "none";
    });
  }

  // Close Popover
  if (closeBtn && widgetCard && triggerBtn) {
    closeBtn.addEventListener("click", () => {
      widgetCard.style.display = "none";
      widgetCard.classList.remove("fullscreen-mode");
      triggerBtn.style.display = "flex";
    });
  }

  // Toggle Fullscreen / Modal mode
  if (expandBtn && widgetCard) {
    expandBtn.addEventListener("click", () => {
      widgetCard.classList.toggle("fullscreen-mode");
    });
  }

  // Send Message
  if (sendBtn && chatInput) {
    const triggerSend = () => {
      const text = chatInput.value.trim();
      if (text) {
        sendToDaltonAI(text);
        chatInput.value = "";
      }
    };

    sendBtn.addEventListener("click", triggerSend);
    chatInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") triggerSend();
    });
  }

  // Preset Chips Listener
  document.querySelectorAll(".preset-chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      const promptText = chip.dataset.prompt;
      if (promptText) sendToDaltonAI(promptText);
    });
  });
});