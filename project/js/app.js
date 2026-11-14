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
const caTabs = ["ai", "isolation", "picker", "activities", "explanation"];

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
// Each "Upload File" button registers a target key; the shared <input> fires
// a callback keyed by which button was pressed most recently.
const fileInput = document.getElementById("file-input");
let pendingUploadTarget = null;

function requestUpload(targetKey) {
  pendingUploadTarget = targetKey;
  fileInput.value = "";
  fileInput.click();
}

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

document.getElementById("ai-upload-btn").addEventListener("click", () => requestUpload("ai"));
document.getElementById("pick-upload-btn").addEventListener("click", () => requestUpload("picker"));
